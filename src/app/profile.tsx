import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { DiagnosticsView } from '@/components/diagnostics-view';
import { Button, Card, Divider, Input, Row, Screen, Section, T, Toggle } from '@/components/ui';
import { C, S } from '@/constants/theme';
import type { AppNotification } from '@/services/types';
import { useVehicle, type Settings } from '@/store/vehicle-store';
import { formatDateTime } from '@/utils/format';

const PHOTO_CREDIT_URL = 'https://commons.wikimedia.org/wiki/File:Alfa_Romeo_GIULIA_2.0_TURBO_VELOCE_(3BA-95220_0016).jpg';
const PHOTO_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
const MODEL_3D_CREDIT_URL = 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept';
const MODEL_3D_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';

const kindIcon: Record<AppNotification['kind'], 'shield' | 'construct' | 'water' | 'information-circle'> = {
  security: 'shield',
  service: 'construct',
  fuel: 'water',
  info: 'information-circle',
};

export default function ProfileScreen() {
  const { status, notifications, settings, update, signOut } = useVehicle();
  const [haResult, setHaResult] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => update({ settings: { ...settings, [key]: value } });

  const testHomeAssistant = async () => {
    const url = settings.homeAssistantUrl.trim();
    if (!/^https?:\/\//.test(url)) return setHaResult('Inserisci un URL webhook valido (http/https)');
    setHaResult('Invio in corso…');
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'alfa_connect_plus_test', fuelPercent: status?.fuelPercent, lock: status?.lock }),
      });
      setHaResult(res.ok ? 'Webhook ricevuto da Home Assistant ✓' : `Errore HTTP ${res.status}`);
    } catch {
      setHaResult('Impossibile raggiungere il webhook');
    }
  };

  if (showDiagnostics) return <DiagnosticsView onBack={() => setShowDiagnostics(false)} />;

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <Screen title="Profilo" subtitle={status ? [status.model, status.year].filter(Boolean).join(' · ') || undefined : undefined}>
      <Section
        title={`Notifiche${unread ? ` · ${unread} nuove` : ''}`}
        action={
          unread ? (
            <Pressable
              accessibilityRole="button"
              style={styles.markRead}
              onPress={() => update({ notifications: notifications.map((n) => ({ ...n, read: true })) })}>
              <T style={{ color: C.accent }}>Segna come lette</T>
            </Pressable>
          ) : undefined
        }>
        <Card>
          {notifications.length === 0 ? <T variant="secondary">Nessuna notifica</T> : null}
          {notifications.slice(0, 8).map((n, i) => (
            <View key={n.id} style={{ gap: S.md }}>
              {i > 0 ? <Divider /> : null}
              <Row
                icon={kindIcon[n.kind]}
                iconColor={n.read ? C.textSecondary : C.accent}
                title={n.title}
                subtitle={`${n.body} · ${formatDateTime(n.at)}`}
                right={!n.read ? <View style={styles.unreadDot} /> : undefined}
              />
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Avvisi">
        <Card>
          <T variant="caption">In arrivo: le preferenze vengono salvate, ma l’app non invia ancora notifiche per questi eventi.</T>
          <Row icon="shield" title="Sicurezza" subtitle="Blocco, sblocco, aree sicure" right={<Toggle label="Sicurezza" value={settings.notifySecurity} onChange={(v) => setSetting('notifySecurity', v)} />} />
          <Divider />
          <Row icon="construct" title="Manutenzione" subtitle="Tagliando, guasti, scadenze" right={<Toggle label="Manutenzione" value={settings.notifyService} onChange={(v) => setSetting('notifyService', v)} />} />
          <Divider />
          <Row icon="water" title="Carburante in riserva" subtitle={`Sotto il ${settings.lowFuelPercent}%`} right={<Toggle label="Carburante in riserva" value={settings.notifyFuel} onChange={(v) => setSetting('notifyFuel', v)} />} />
          <View style={styles.chips}>
            {[10, 15, 20, 25].map((p) => (
              <Pressable
                key={p}
                accessibilityRole="button"
                accessibilityLabel={`Soglia ${p}%`}
                accessibilityState={{ selected: settings.lowFuelPercent === p }}
                onPress={() => setSetting('lowFuelPercent', p)}
                style={[styles.chip, settings.lowFuelPercent === p && styles.chipActive]}>
                <T style={[styles.chipLabel, settings.lowFuelPercent === p && { color: C.onInk }]}>{p}%</T>
              </Pressable>
            ))}
          </View>
        </Card>
      </Section>

      <Section title="Smart home">
        <Card>
          <T variant="caption">
            Per ora puoi solo inviare un test a un webhook di Home Assistant; l’invio automatico dello stato non c’è ancora.
          </T>
          <Input
            label="URL webhook Home Assistant"
            placeholder="https://casa.duckdns.org/api/webhook/giulia"
            autoCapitalize="none"
            value={settings.homeAssistantUrl}
            onChangeText={(v) => setSetting('homeAssistantUrl', v)}
          />
          <Button label="Invia test" icon="home" kind="secondary" onPress={testHomeAssistant} />
          {haResult ? <T variant="caption">{haResult}</T> : null}
        </Card>
      </Section>

      <Section title="Account">
        <Card>
          {status ? <Row icon="barcode" title="VIN" subtitle={status.vin} /> : null}
          <Button label="Esci" icon="log-out" kind="danger" onPress={signOut} />
        </Card>
      </Section>

      <Section title="Avanzate">
        <Card>
          <Row icon="pulse" title="Diagnostica" subtitle="Chiamate all’auto e struttura delle risposte" chevron onPress={() => setShowDiagnostics(true)} />
        </Card>
      </Section>

      <Section title="Crediti">
        <Card>
          <Row
            icon="image"
            title="Foto dell’auto"
            subtitle="“Alfa Romeo GIULIA 2.0 TURBO VELOCE (3BA-95220 0016)” di Tokumeigakarinoaoshima, Wikimedia Commons, licenza CC BY-SA 4.0. Immagine modificata: sfondo rimosso, colore regolato."
            right={<Ionicons name="open-outline" size={16} color={C.textMuted} />}
            role="link"
            onPress={() => Linking.openURL(PHOTO_CREDIT_URL)}
          />
          <Row
            icon="document-text"
            title="Licenza CC BY-SA 4.0"
            right={<Ionicons name="open-outline" size={16} color={C.textMuted} />}
            role="link"
            onPress={() => Linking.openURL(PHOTO_LICENSE_URL)}
          />
          <Divider />
          <Row
            icon="cube"
            title="Modello 3D in Servizi"
            subtitle="“Car Concept”, © 2024 Darmstadt Graphics Group GmbH / Khronos Group, licenza CC BY 4.0. Modello illustrativo: non è la Giulia del proprietario."
            right={<Ionicons name="open-outline" size={16} color={C.textMuted} />}
            role="link"
            onPress={() => Linking.openURL(MODEL_3D_CREDIT_URL)}
          />
          <Row
            icon="document-text"
            title="Licenza CC BY 4.0"
            right={<Ionicons name="open-outline" size={16} color={C.textMuted} />}
            role="link"
            onPress={() => Linking.openURL(MODEL_3D_LICENSE_URL)}
          />
          <Divider />
          <T variant="caption">Alfa Romeo è un marchio del rispettivo proprietario. App personale, non ufficiale e non affiliata.</T>
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, paddingLeft: 46 },
  markRead: { minHeight: 44, justifyContent: 'center' },
  chip: { minHeight: 44, minWidth: 56, paddingHorizontal: S.md, borderRadius: 999, backgroundColor: C.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: C.ink },
  chipLabel: { fontSize: 13 },
});
