import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';

import { CarIllustration } from '@/components/car-illustration';
import { Badge, Button, Card, Divider, Hero, IconButton, Progress, Row, Screen, Section, SquareAction, T, TileCard } from '@/components/ui';
import { C, S } from '@/constants/theme';
import type { RemoteCommand } from '@/services/types';
import { useVehicle } from '@/store/vehicle-store';
import { formatDateTime, km } from '@/utils/format';

const DASH = '—';

// Thresholds for "needs attention": heuristics (not manufacturer values), unverified on the real car.
const OIL_LOW_PERCENT = 25;
const BATTERY_LOW_VOLTS = 12.2;

const QUICK_ACTIONS: { cmd: RemoteCommand; icon: 'lock-outline' | 'lock-open-variant-outline' | 'car-light-high' | 'bullhorn-outline'; label: string }[] = [
  { cmd: 'lock', icon: 'lock-outline', label: 'Blocca' },
  { cmd: 'unlock', icon: 'lock-open-variant-outline', label: 'Sblocca' },
  { cmd: 'lights', icon: 'car-light-high', label: 'Lampeggia luci' },
  { cmd: 'horn', icon: 'bullhorn-outline', label: 'Luci e clacson' },
];

// A single long word must never break mid-word, so long words get a smaller size (plus shrink-to-fit above).
const longestWord = (text: string) => Math.max(...text.split(' ').map((w) => w.length));

const decimal = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function VehicleScreen() {
  const { status, refresh, refreshing, command, requestCommand, faults, settings, loadError } = useVehicle();
  const { width } = useWindowDimensions();
  const focused = useIsFocused();
  const lightsOn = useBlinkingLights(command?.cmd === 'lights' && command.phase === 'done');

  if (!status) {
    return loadError ? (
      <Screen title="Veicolo" onRefresh={refresh} refreshing={refreshing}>
        <Card>
          <T style={{ color: C.danger }}>{loadError}</T>
          <Button label="Riprova" icon="refresh" onPress={refresh} disabled={refreshing} />
        </Card>
      </Screen>
    ) : (
      <View style={styles.loading}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  const title = status.name ?? status.model ?? 'Veicolo';
  const subtitle = [status.name ? status.model : null, status.year].filter(Boolean).join(' · ');
  const lowFuel = status.fuelLow ?? (status.fuelPercent !== null && status.fuelPercent <= settings.lowFuelPercent);

  // Only real fields are used below: a missing value shows DASH or hides the line, it is never replaced by a guess.
  const knownDoors = Object.values(status.doors).filter((d) => d !== null);
  const unlockedDoors = knownDoors.filter((d) => d === 'unlocked').length;
  const tyreEntries = status.tyres ? [status.tyres.fl, status.tyres.fr, status.tyres.rl, status.tyres.rr] : [];
  const tyreWarnings = tyreEntries.filter((t) => t.warning === true).length;
  const tyreReported = tyreEntries.some((t) => t.warning !== null);
  const oilLow = status.oilLevelPercent !== null && status.oilLevelPercent <= OIL_LOW_PERCENT;
  const batteryLow = status.batteryVoltage !== null && status.batteryVoltage < BATTERY_LOW_VOLTS;
  const windowsOpen = status.windowsClosed === false;
  const knownBars = tyreEntries.map((t) => t.bar).filter((b): b is number => b !== null);

  const serviceKm = status.nextServiceKm;
  const serviceDays = status.nextServiceDays;
  // A due date of today or in the past must not read "entro -N giorni".
  // nextServiceDays semantics (days left, <= 0 = due) are unverified on the real service.
  const serviceDue = serviceDays !== null && serviceDays <= 0 ? (serviceDays === 0 ? 'Oggi' : 'Scaduto') : null;

  // Items that need attention among the KNOWN values (an unknown value cannot be counted, only a reported problem).
  const attention = [lowFuel, tyreWarnings > 0, oilLow, batteryLow, windowsOpen, (faults?.length ?? 0) > 0, serviceDue !== null].filter(Boolean).length;
  // Business rule for the headline: "Tutto ok" is claimed only when the lock state is known AND locked, the vehicle
  // health report is known AND empty, fuel level AND tyre data are known, nothing known needs attention and the data
  // is complete and fresh. Other unknown values (oil, battery, ...) are not counted as problems.
  // Otherwise it reports the lock state; with no lock data it says so instead of guessing.
  const tyresKnown = tyreReported || knownBars.length > 0;
  const allClear =
    status.lock === 'locked' && faults !== null && faults.length === 0 && status.fuelPercent !== null && tyresKnown && attention === 0 && !status.partial && !loadError;
  const headline = allClear ? 'Tutto ok' : status.lock === 'locked' ? 'Bloccata' : status.lock === 'unlocked' ? 'Sbloccata' : 'Stato non disponibile';
  const attentionLine = attention > 0 ? (attention === 1 ? '1 punto da controllare' : `${attention} punti da controllare`) : null;

  const stateLines: string[] = [];
  if (knownDoors.length > 0) {
    stateLines.push(
      unlockedDoors === 0 ? 'Porte chiuse a chiave' : unlockedDoors === 1 ? '1 porta non chiusa a chiave' : `${unlockedDoors} porte non chiuse a chiave`,
    );
  }
  if (status.windowsClosed !== null) stateLines.push(status.windowsClosed ? 'Finestrini chiusi' : 'Finestrini aperti');

  const bar = (b: number | null) => (b !== null ? decimal(b) : DASH);

  const serviceSubtitle =
    serviceDue ?? (serviceKm !== null && serviceDays !== null ? `entro ${serviceDays} giorni` : serviceKm !== null ? 'Km rimanenti' : 'Prossimo tagliando');

  const nextSteps: ReactNode[] = [];
  if (faults && faults.length > 0) {
    nextSteps.push(
      <Row
        icon="warning"
        iconColor={C.warning}
        title={`${faults.length} avvisi del veicolo`}
        subtitle={faults[0].title}
        chevron
        onPress={() => router.push('/services')}
      />,
    );
  }
  if (status.location) {
    nextSteps.push(
      <Row
        icon="location"
        title="Posizione"
        subtitle={`${status.location.lat.toFixed(5)}, ${status.location.lng.toFixed(5)}`}
        chevron
        onPress={() => router.push('/map')}
      />,
    );
  }

  const actions = QUICK_ACTIONS.filter((a) => status.supportedCommands.includes(a.cmd));

  return (
    <Screen
      onRefresh={refresh}
      refreshing={refreshing}
      hero={
        <Hero>
          {/* The hero is dark at the top: switch the status bar to light icons while this tab is focused. */}
          {focused ? <StatusBar style="light" /> : null}
          <View style={styles.heroBar}>
            <View style={styles.heroSide} />
            <View style={styles.heroTitle}>
              <T style={styles.heroName} numberOfLines={1}>
                {title}
              </T>
              {subtitle ? (
                <T variant="caption" style={{ color: C.heroTextSecondary }} numberOfLines={1}>
                  {subtitle}
                </T>
              ) : null}
            </View>
            <View style={[styles.heroSide, { alignItems: 'flex-end' }]}>
              <IconButton icon="refresh" label="Aggiorna" color={C.heroText} onPress={refresh} style={styles.heroRefresh} />
            </View>
          </View>

          <View style={styles.headlineBlock}>
            <T
              variant="display"
              accessibilityRole="header"
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
              style={longestWord(headline) >= 8 ? styles.displayLong : undefined}>
              {headline}
            </T>
            {attentionLine ? <T style={{ color: C.heroTextSecondary, marginTop: S.sm }}>{attentionLine}</T> : null}
          </View>

          <View style={styles.car}>
            <CarIllustration width={Math.min(width, 560) * 1.03} lightsOn={lightsOn} />
          </View>
          {status.updatedAt ? (
            <T variant="caption" style={styles.updated}>
              Aggiornato il {formatDateTime(status.updatedAt)}
            </T>
          ) : null}
        </Hero>
      }>
      {loadError ? <T style={{ color: C.danger }}>{loadError}</T> : null}
      {status.partial ? <T variant="caption">Dati parziali: alcune letture non sono riuscite e potrebbero non essere aggiornate.</T> : null}

      {/* A button exists only if the car's enabled services allow that command. */}
      {actions.length > 0 ? (
        <View style={styles.tileRow}>
          {actions.map((a) => (
            <SquareAction
              key={a.cmd}
              icon={a.icon}
              label={a.label}
              active={(a.cmd === 'lock' && status.lock === 'locked') || (a.cmd === 'unlock' && status.lock === 'unlocked')}
              onPress={() => requestCommand(a.cmd)}
            />
          ))}
        </View>
      ) : (
        <T variant="caption">Comandi remoti non disponibili per questa auto</T>
      )}

      <Card>
        <View style={styles.fuelTop}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.inline}>
              <MaterialCommunityIcons name="gas-station-outline" size={20} color={lowFuel ? C.warning : C.text} />
              <T style={styles.cardTitle}>Carburante</T>
              {lowFuel ? <Badge label="Riserva" color={C.warning} /> : null}
            </View>
            <T variant="caption">{status.fuelPercent !== null ? `Autonomia · livello ${Math.round(status.fuelPercent)}%` : 'Autonomia'}</T>
          </View>
          <T variant="big">
            {status.rangeKm !== null ? km(status.rangeKm) : DASH}
            {status.rangeKm !== null ? <T variant="secondary"> km</T> : null}
          </T>
        </View>
        {status.fuelPercent !== null ? <Progress value={status.fuelPercent} color={lowFuel ? C.warning : C.ink} /> : null}
      </Card>

      <View style={{ gap: S.md }}>
        <View style={styles.tileRow}>
          <TileCard
            title="Stato"
            subtitle={stateLines.length > 0 ? stateLines.join('\n') : undefined}
            subtitleColor={unlockedDoors > 0 || windowsOpen ? C.warning : undefined}
            value={stateLines.length > 0 ? undefined : DASH}
            icon={
              <>
                {status.lock ? (
                  <MaterialCommunityIcons
                    name={status.lock === 'locked' ? 'lock-outline' : 'lock-open-variant-outline'}
                    size={22}
                    color={status.lock === 'locked' ? C.success : C.warning}
                  />
                ) : null}
                {status.windowsClosed !== null ? (
                  <MaterialCommunityIcons name="car-windshield-outline" size={22} color={windowsOpen ? C.warning : C.textSecondary} />
                ) : null}
              </>
            }
          />
          <TileCard
            title="Pneumatici"
            subtitle={tyreWarnings > 0 ? `${tyreWarnings} da controllare` : tyreReported ? 'Nessun avviso' : 'Pressione minima'}
            subtitleColor={tyreWarnings > 0 ? C.warning : undefined}
            value={knownBars.length > 0 ? decimal(Math.min(...knownBars)) : DASH}
            unit={knownBars.length > 0 ? 'bar' : undefined}
            icon={<MaterialCommunityIcons name="car-tire-alert" size={22} color={tyreWarnings > 0 ? C.warning : C.textSecondary} />}
            footer={
              status.tyres && knownBars.length > 0 ? (
                <View>
                  <T variant="caption">{`Ant. ${bar(status.tyres.fl.bar)} · ${bar(status.tyres.fr.bar)}`}</T>
                  <T variant="caption">{`Post. ${bar(status.tyres.rl.bar)} · ${bar(status.tyres.rr.bar)}`}</T>
                </View>
              ) : undefined
            }
          />
        </View>
        <View style={styles.tileRow}>
          <TileCard
            title="Olio"
            subtitle={oilLow ? 'Livello basso' : 'Livello'}
            subtitleColor={oilLow ? C.warning : undefined}
            value={status.oilLevelPercent !== null ? String(Math.round(status.oilLevelPercent)) : DASH}
            unit={status.oilLevelPercent !== null ? '%' : undefined}
            icon={<MaterialCommunityIcons name="oil" size={22} color={oilLow ? C.warning : C.textSecondary} />}
          />
          <TileCard
            title="Batteria 12 V"
            subtitle={batteryLow ? 'Tensione bassa' : 'Tensione'}
            subtitleColor={batteryLow ? C.warning : undefined}
            value={status.batteryVoltage !== null ? decimal(status.batteryVoltage) : DASH}
            unit={status.batteryVoltage !== null ? 'V' : undefined}
            icon={<MaterialCommunityIcons name="car-battery" size={22} color={batteryLow ? C.warning : C.textSecondary} />}
          />
        </View>
        <View style={styles.tileRow}>
          <TileCard
            title="Tagliando"
            subtitle={serviceSubtitle}
            subtitleColor={serviceDue ? C.warning : undefined}
            value={serviceKm !== null ? km(serviceKm) : serviceDays !== null && serviceDays > 0 ? String(serviceDays) : DASH}
            unit={serviceKm !== null ? 'km' : serviceDays !== null && serviceDays > 0 ? 'giorni' : undefined}
            icon={<MaterialCommunityIcons name="car-wrench" size={22} color={C.textSecondary} />}
            onPress={() => router.push('/services')}
          />
          <TileCard
            title="Chilometraggio"
            subtitle="Totale"
            value={status.odometerKm !== null ? km(status.odometerKm) : DASH}
            unit={status.odometerKm !== null ? 'km' : undefined}
            icon={<Ionicons name="speedometer-outline" size={22} color={C.textSecondary} />}
          />
        </View>
      </View>

      {nextSteps.length > 0 ? (
        <Section title="Prossimi passi">
          <Card>
            {nextSteps.map((row, i) => (
              <Fragment key={i}>
                {i > 0 ? <Divider /> : null}
                {row}
              </Fragment>
            ))}
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

function useBlinkingLights(trigger: boolean) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!trigger) return;
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setOn((v) => !v);
      if (n >= 6) {
        clearInterval(id);
        setOn(false);
      }
    }, 300);
    return () => clearInterval(id);
  }, [trigger]);
  return on;
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  heroBar: { flexDirection: 'row', alignItems: 'center' },
  heroSide: { width: 44 },
  heroTitle: { flex: 1, alignItems: 'center' },
  heroName: { color: C.heroText, fontSize: 16, fontWeight: '700' },
  heroRefresh: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.heroControl, alignItems: 'center', justifyContent: 'center' },
  headlineBlock: { paddingTop: S.xl },
  displayLong: { fontSize: 44, lineHeight: 46, letterSpacing: -1 },
  // Slightly wider than the screen and left-aligned: the photo's cut-off tail bleeds off the right edge.
  car: { alignItems: 'flex-start', marginTop: S.lg, marginHorizontal: -S.lg },
  updated: { textAlign: 'center', paddingBottom: S.lg },
  tileRow: { flexDirection: 'row', gap: S.md },
  fuelTop: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  cardTitle: { fontSize: 16, fontWeight: '700' },
});
