import { useState, useSyncExternalStore } from 'react';
import { Platform, Share, StyleSheet } from 'react-native';

import { C } from '@/constants/theme';
import { clearLog, entryLine, exportText, getEntries, getRawNotice, subscribe, type LogEntry } from '@/services/uconnect/recorder';

import { Badge, Button, Card, Divider, Row, Screen, Section, T } from './ui';

const statusColor = (e: LogEntry) => (e.status === null ? C.danger : e.status < 300 ? C.success : e.status < 500 ? C.warning : C.danger);

/** Recent calls to the car's cloud and the sanitized structure of the answers. Shows nothing personal. */
export function DiagnosticsView({ onBack }: { onBack: () => void }) {
  const entries = useSyncExternalStore(subscribe, getEntries);
  const [selected, setSelected] = useState<number | null>(null);
  const open = entries.find((e) => e.id === selected && e.structure);

  return (
    <Screen title="Diagnostica" subtitle="Ultime chiamate all’auto">
      <Card>
        <T variant="caption">
          Password, token e PIN non vengono mai salvati. Il registro mostra ora, indirizzo senza identificativi, esito e, per le letture dei dati,
          la struttura della risposta senza i valori. È progettato per non includere dati personali, ma controlla il testo prima di condividerlo.
          Resta in memoria e sparisce con l’uscita o la chiusura dell’app.
        </T>
        {getRawNotice() ? (
          <T style={{ color: C.danger }}>
            Modalità raw attiva: le risposte contengono dati personali, non condividerle. Apri DevTools, scheda Network, e filtra /raw-log.
          </T>
        ) : null}
        <Button label="Condividi" icon="share-social" disabled={entries.length === 0} onPress={() => Share.share({ message: exportText() })} />
        <Button label="Cancella registro" kind="secondary" disabled={entries.length === 0} onPress={clearLog} />
        <Button label="Indietro" kind="secondary" onPress={onBack} />
      </Card>

      <Section title="Chiamate recenti">
        <Card>
          {entries.length === 0 ? <Row icon="list-outline" title="Nessuna chiamata registrata" subtitle="Aggiorna la schermata Veicolo per vederne." /> : null}
          {entries.map((e, i) => (
            <Row
              key={e.id}
              icon={e.structure ? 'document-text-outline' : undefined}
              title={`${e.method} ${e.host} ${e.path}`}
              subtitle={`${new Date(e.at).toLocaleTimeString('it-IT')} · ${e.ms} ms${e.structure ? ' · tocca per la struttura' : ''}`}
              right={<Badge label={String(e.status ?? e.error ?? '?')} color={statusColor(e)} />}
              onPress={e.structure ? () => setSelected(e.id === selected ? null : e.id) : undefined}
            />
          ))}
        </Card>
      </Section>

      {open ? (
        <Section title="Struttura della risposta">
          <Card>
            <T variant="caption">{entryLine(open)}</T>
            {open.summary.map((s) => (
              <T key={s}>{s}</T>
            ))}
            <Divider />
            <T variant="caption" style={styles.mono} selectable>
              {open.structure}
            </T>
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
});
