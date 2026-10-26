import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Platform, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Row, Screen, T } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { useVehicle } from '@/store/vehicle-store';
import { formatDateTime } from '@/utils/format';

// Web build only: expo-maps has no web support at all (its native module import throws outside
// iOS/Android), so this platform-specific file keeps a text-card fallback instead of crashing the web
// bundle. See map.tsx for the real interactive map (with its own search section) used on iOS/Android.
// Redesigned 2026-10-23 alongside map.tsx: since there is no real map here to search "around", the
// search section is a simple link-out to Google Maps' own search (near the car's coordinates) instead of
// reinventing a geocoder/interactive map on web. "Cerca i miei amici" was requested but is intentionally
// NOT implemented here either, for the same reason as map.tsx (no real location-sharing service exists).
export default function MapScreen() {
  const { status, loadError, refresh, refreshing } = useVehicle();
  const location = status?.location ?? null;

  return (
    <Screen title="Mappa" subtitle="Dove si trova la tua auto" onRefresh={refresh} refreshing={refreshing}>
      {location ? (
        <>
          <LocationCard lat={location.lat} lng={location.lng} approximate={location.approximate} updatedAt={location.updatedAt} />
          <SearchLinkOut lat={location.lat} lng={location.lng} />
        </>
      ) : (
        <Card>
          <Row
            icon="location-outline"
            title="Posizione non disponibile"
            subtitle={status ? 'L’auto non ha comunicato la sua ultima posizione.' : (loadError ?? 'Dati dell’auto non ancora caricati.')}
          />
        </Card>
      )}
    </Screen>
  );
}

function LocationCard({ lat, lng, approximate, updatedAt }: { lat: number; lng: number; approximate: boolean | null; updatedAt: string | null }) {
  const mapsUrl =
    Platform.OS === 'ios'
      ? `https://maps.apple.com/?q=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
  const detail = [approximate ? 'posizione approssimativa' : null, updatedAt ? `aggiornata il ${formatDateTime(updatedAt)}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card>
      <Row icon="location" iconColor={C.accent} title="Posizione attuale" subtitle={detail || undefined} />
      <T variant="value">{`${lat.toFixed(5)}, ${lng.toFixed(5)}`}</T>
      <Button label="Apri in Mappe" icon="map" onPress={() => Linking.openURL(mapsUrl)} />
      <View style={styles.buttons}>
        <View style={{ flex: 1 }}>
          <Button label="Raggiungi" icon="walk" kind="secondary" onPress={() => Linking.openURL(directionsUrl)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="Condividi"
            icon="share-social"
            kind="secondary"
            onPress={() => Share.share({ message: `La mia auto è qui: https://www.google.com/maps/search/?api=1&query=${lat},${lng}` })}
          />
        </View>
      </View>
    </Card>
  );
}

// No interactive map on web, so "search near the car" means opening Google Maps' own search centred on
// the car's coordinates in a new tab — honest about what it does, not a fake in-app search.
function SearchLinkOut({ lat, lng }: { lat: number; lng: number }) {
  const [query, setQuery] = useState('');
  const openQuery = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    Linking.openURL(`https://www.google.com/maps/search/${encodeURIComponent(trimmed)}/@${lat},${lng},14z`);
  };

  return (
    <Card>
      <Row icon="search" title="Cerca un indirizzo o un luogo" subtitle="Apre Google Maps in una nuova scheda, vicino alla posizione dell’auto" />
      <View style={styles.searchBar}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Es. farmacia, via Roma 10…"
          placeholderTextColor={C.textMuted}
          style={styles.searchInput}
          onSubmitEditing={() => openQuery(query)}
          returnKeyType="search"
          accessibilityLabel="Cerca un indirizzo o un luogo"
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Cerca" onPress={() => openQuery(query)} hitSlop={10}>
          <Ionicons name="search" size={18} color={C.accent} />
        </Pressable>
      </View>
      <View style={styles.buttons}>
        <View style={{ flex: 1 }}>
          <Button label="Distributori" icon="flame-outline" kind="secondary" onPress={() => openQuery('distributori di benzina')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Concessionarie" icon="storefront-outline" kind="secondary" onPress={() => openQuery('concessionarie auto')} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', gap: S.sm, alignItems: 'flex-end' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    backgroundColor: C.surfaceRaised,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: S.md,
    height: 48,
  },
  searchInput: { flex: 1, fontSize: 15, color: C.text },
});
