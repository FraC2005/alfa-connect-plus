import { useState } from 'react';

import { Car3DView } from '@/components/car-3d-view';
import { GiuliaHistoryView } from '@/components/giulia-history-view';
import { Card, Row, Screen, Section, T } from '@/components/ui';
import { useVehicle } from '@/store/vehicle-store';

export default function ServicesScreen() {
  const { refresh, refreshing } = useVehicle();
  const [showHistory, setShowHistory] = useState(false);

  if (showHistory) return <GiuliaHistoryView onBack={() => setShowHistory(false)} />;

  return (
    <Screen title="Servizi" subtitle="Diagnostica e manutenzione" onRefresh={refresh} refreshing={refreshing}>
      {/* Pneumatici/carburante, diagnostica, tagliando e storico sono stati rimossi su richiesta: questa schermata
          resta per ora con un modellino 3D interattivo e la sola sezione Curiosità. */}
      <Section title="La tua Giulia in 3D">
        <Card>
          <Car3DView />
          <T variant="caption">
            Modello illustrativo (concept car generico, non è la tua Giulia reale): trascina per ruotare. Richiede l’app su iOS/Android.
          </T>
        </Card>
      </Section>

      <Section title="Curiosità">
        <Card>
          <Row
            icon="book"
            title="La storia della Giulia"
            subtitle="Dal 1962 alla Veloce di oggi, in breve"
            chevron
            onPress={() => setShowHistory(true)}
          />
        </Card>
      </Section>
    </Screen>
  );
}
