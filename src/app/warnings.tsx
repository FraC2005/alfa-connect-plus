import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { TyreDiagram } from '@/components/tyre-diagram';
import { Badge, Card, Divider, Row, Screen, Section, T, TileCard } from '@/components/ui';
import { C, S } from '@/constants/theme';
import type { WarningLight } from '@/services/types';
import { useVehicle } from '@/store/vehicle-store';
import { km } from '@/utils/format';

const DASH = '—';

// Same 1-decimal formatting used for these fields elsewhere (index.tsx, services.tsx).
const decimal = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Per-state look: label, colour and icon for the badge next to each warning light. 'unknown' is never styled as 'ok'. */
const stateInfo: Record<WarningLight['state'], { label: string; color: string; icon: 'checkmark-circle' | 'warning' | 'help-circle' }> = {
  ok: { label: 'OK', color: C.textSecondary, icon: 'checkmark-circle' },
  warning: { label: 'Attenzione', color: C.warning, icon: 'warning' },
  unknown: { label: 'Non disponibile', color: C.textMuted, icon: 'help-circle' },
};

export default function WarningsScreen() {
  const { status, warningLights, refresh, refreshing } = useVehicle();

  const serviceKm = status?.nextServiceKm ?? null;
  const serviceDays = status?.nextServiceDays ?? null;
  // A due date of today or in the past must not read as a raw (possibly negative) day count.
  // nextServiceDays semantics (days left, <= 0 = due) are unverified on the real service.
  const serviceDue = serviceDays !== null && serviceDays <= 0 ? (serviceDays === 0 ? 'Oggi' : 'Scaduto') : null;

  return (
    <Screen title="Spie" subtitle="Avvisi del cruscotto" onRefresh={refresh} refreshing={refreshing}>
      <Section title="Dati diagnostici">
        <View style={styles.tileRow}>
          <TileCard
            title="Batteria 12 V"
            subtitle="Tensione"
            value={status?.batteryVoltage !== null && status?.batteryVoltage !== undefined ? decimal(status.batteryVoltage) : DASH}
            unit={status?.batteryVoltage !== null && status?.batteryVoltage !== undefined ? 'V' : undefined}
            icon={<MaterialCommunityIcons name="car-battery" size={22} color={C.textSecondary} />}
          />
          <TileCard
            title="Chilometraggio"
            subtitle="Totale"
            value={status?.odometerKm !== null && status?.odometerKm !== undefined ? km(status.odometerKm) : DASH}
            unit={status?.odometerKm !== null && status?.odometerKm !== undefined ? 'km' : undefined}
            icon={<Ionicons name="speedometer-outline" size={22} color={C.textSecondary} />}
          />
        </View>
        <View style={styles.tileRow}>
          <TileCard
            title="Tagliando"
            subtitle={
              serviceDue ?? (serviceKm !== null && serviceDays !== null ? `Prossimo · tra ${serviceDays} giorni` : 'Prossimo')
            }
            subtitleColor={serviceDue ? C.warning : undefined}
            value={serviceKm !== null ? km(serviceKm) : serviceDays !== null && serviceDays > 0 ? String(serviceDays) : DASH}
            unit={serviceKm !== null ? 'km' : serviceDays !== null && serviceDays > 0 ? 'giorni' : undefined}
            icon={<MaterialCommunityIcons name="car-wrench" size={22} color={C.textSecondary} />}
          />
          <TileCard
            title="Carburante"
            subtitle="Livello"
            value={status?.fuelPercent !== null && status?.fuelPercent !== undefined ? String(Math.round(status.fuelPercent)) : DASH}
            unit={status?.fuelPercent !== null && status?.fuelPercent !== undefined ? '%' : undefined}
            icon={<MaterialCommunityIcons name="gas-station-outline" size={22} color={C.textSecondary} />}
          />
        </View>
        <Card>
          <View style={styles.inline}>
            <MaterialCommunityIcons name="car-tire-alert" size={20} color={C.text} />
            <T style={styles.cardTitle}>Pneumatici</T>
          </View>
          <TyreDiagram tyres={status?.tyres ?? null} />
        </Card>
      </Section>

      <T variant="caption">
        Questi dati arrivano dal rapporto di salute dell’auto: possono restare “Non disponibile” per periodi lunghi se l’auto non li ha ancora
        trasmessi.
      </T>

      <Section title="Spie cruscotto">
        <Card>
          {warningLights === null ? (
            <Row icon="help-circle" title="Dati spie non disponibili per questa auto o in questo momento" />
          ) : (
            warningLights.map((w, i) => {
              const info = stateInfo[w.state];
              return (
                <View key={w.code} style={{ gap: S.md }}>
                  {i > 0 ? <Divider /> : null}
                  <Row icon={info.icon} iconColor={info.color} title={w.label} right={<Badge label={info.label} color={info.color} />} />
                </View>
              );
            })
          )}
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tileRow: { flexDirection: 'row', gap: S.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  cardTitle: { fontSize: 16, fontWeight: '700' },
});
