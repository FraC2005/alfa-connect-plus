import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AppleMaps, GoogleMaps } from 'expo-maps';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { Button, Card, IconButton, Row, Screen, SheetPanel, T } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { useVehicle } from '@/store/vehicle-store';
import { formatDateTime } from '@/utils/format';

// Real interactive map (expo-maps: AppleMaps on iOS, GoogleMaps on Android), reinstated 2026-10-23 at the
// owner's explicit request after an earlier attempt was dropped for feeling invasive (see HANDOFF.md A2).
// Redesigned the same day: the map is now the dominant element (see VehicleMap), the "Posizione attuale"
// card became a compact chip overlaid on top of the map (LocationChip) instead of a separate card below
// it, and a search section was added at the bottom (SearchSection) for free-text places plus two quick
// categories ("Distributori"/"Concessionarie") via the free Nominatim/Overpass OpenStreetMap APIs — no
// API key, fetched directly from this screen per the task's instructions (not through VehicleService).
// "Cerca i miei amici" was explicitly requested by the owner but is intentionally NOT implemented: there
// is no real location-sharing service in this integration (consistent with the earlier removal of the
// fake "Guidatori condivisi" feature, see HANDOFF.md) — omitted silently, no placeholder.
// expo-maps requires a development build (`npx expo run:android` / `run:ios`) and does NOT run inside
// Expo Go. It has no web support at all (see map.web.tsx for the web fallback), which is why this file is
// native-only and the web build never imports it.
export default function MapScreen() {
  const { status, loadError, refresh, refreshing } = useVehicle();
  const location = status?.location ?? null;
  // See the comment on VehicleMap below: the outer Screen renders its content inside a ScrollView, and
  // that ScrollView's own pan responder competes with the native map's pan/pinch gestures for the same
  // touch. Suspending the ScrollView's scrolling for the duration of a touch that starts on the map
  // resolves the conflict without giving up pull-to-refresh elsewhere on the screen.
  const [mapTouchActive, setMapTouchActive] = useState(false);

  return (
    <Screen
      title="Mappa"
      subtitle="Dove si trova la tua auto"
      onRefresh={refresh}
      refreshing={refreshing}
      scrollEnabled={!mapTouchActive}>
      {location ? (
        <MapExplorer
          lat={location.lat}
          lng={location.lng}
          approximate={location.approximate}
          updatedAt={location.updatedAt}
          onMapTouchActiveChange={setMapTouchActive}
        />
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

type PlaceResult = { id: string; lat: number; lng: number; label: string };
type SearchKind = 'address' | 'fuel' | 'dealer';
type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; kind: SearchKind }
  | { status: 'done'; kind: SearchKind; results: PlaceResult[] }
  | { status: 'error'; kind: SearchKind; message: string };

// Identifies the app to OpenStreetMap's free services, as their usage policies ask (no API key, but a
// distinctive caller): https://operations.osmfoundation.org/policies/nominatim/ and the Overpass equivalent.
const OSM_USER_AGENT = 'AlfaConnectPlus/1.0 (personal, non-commercial Expo app)';

async function searchAddress(query: string, near: { lat: number; lng: number }, signal: AbortSignal): Promise<PlaceResult[]> {
  // Nominatim has no literal "near" parameter: bias results with a loose viewbox around the car instead
  // of restricting to it (bounded=0), so a real match a few km away still surfaces before unrelated ones.
  const span = 0.5; // degrees; generous enough on purpose not to hide legitimate matches further out
  const viewbox = `${near.lng - span},${near.lat + span},${near.lng + span},${near.lat - span}`;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=it&viewbox=${viewbox}&bounded=0&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal, headers: { 'User-Agent': OSM_USER_AGENT, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const data: { place_id: number; lat: string; lon: string; display_name: string }[] = await res.json();
  return data.map((d) => ({ id: `n${d.place_id}`, lat: Number(d.lat), lng: Number(d.lon), label: d.display_name }));
}

async function searchOverpass(kind: 'fuel' | 'dealer', near: { lat: number; lng: number }, signal: AbortSignal): Promise<PlaceResult[]> {
  // amenity=fuel = distributori di benzina; shop=car = concessionarie/rivenditori auto (tagging OSM standard).
  const filter = kind === 'fuel' ? 'amenity=fuel' : 'shop=car';
  const radiusMeters = 8000;
  const query = `[out:json][timeout:20];node[${filter}](around:${radiusMeters},${near.lat},${near.lng});out body 30;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': OSM_USER_AGENT },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data: { elements: { id: number; lat: number; lon: number; tags?: Record<string, string> }[] } = await res.json();
  return data.elements
    .filter((e) => typeof e.lat === 'number' && typeof e.lon === 'number')
    .map((e) => ({ id: `o${e.id}`, lat: e.lat, lng: e.lon, label: e.tags?.name || (kind === 'fuel' ? 'Distributore' : 'Concessionaria') }));
}

function MapExplorer({
  lat,
  lng,
  approximate,
  updatedAt,
  onMapTouchActiveChange,
}: {
  lat: number;
  lng: number;
  approximate: boolean | null;
  updatedAt: string | null;
  onMapTouchActiveChange: (active: boolean) => void;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  const runSearch = useCallback((kind: SearchKind, fn: (signal: AbortSignal) => Promise<PlaceResult[]>) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearch({ status: 'loading', kind });
    fn(controller.signal)
      .then((results) => setSearch({ status: 'done', kind, results }))
      .catch(() => {
        if (controller.signal.aborted) return; // superseded by a newer search, not a real failure
        setSearch({ status: 'error', kind, message: 'Ricerca non riuscita. Controlla la connessione e riprova.' });
      });
  }, []);

  // Owner-requested "rimuovi selezione": clears whatever search is active (category or free-text) and
  // its markers/results, returning the map to just the car marker. Used by the collapsed search chip's
  // own clear button and by tapping an already-active category chip a second time.
  const clearSearch = useCallback(() => {
    abortRef.current?.abort();
    setSearch({ status: 'idle' });
    setQuery('');
  }, []);

  const toggleCategory = useCallback(
    (kind: 'fuel' | 'dealer') => {
      if (search.status !== 'idle' && search.kind === kind) {
        clearSearch();
        return;
      }
      runSearch(kind, (signal) => searchOverpass(kind, { lat, lng }, signal));
    },
    [search, clearSearch, runSearch, lat, lng]
  );

  // Free-text geocoding is debounced so Nominatim (public, rate-limited) isn't hit on every keystroke.
  // Clearing the box only resets an address search in progress: it must not wipe a category search
  // (Distributori/Concessionarie) that the owner just ran and left on screen while idly editing the box.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      if (searchRef.current.status === 'idle' || searchRef.current.kind === 'address') {
        abortRef.current?.abort();
        setSearch({ status: 'idle' });
      }
      return;
    }
    const t = setTimeout(() => runSearch('address', (signal) => searchAddress(trimmed, { lat, lng }, signal)), 450);
    return () => clearTimeout(t);
  }, [query, lat, lng, runSearch]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const placeMarkers = useMemo(
    () =>
      search.status === 'done'
        ? search.results.map((r) => ({ coordinates: { latitude: r.lat, longitude: r.lng }, title: r.label }))
        : [],
    [search]
  );

  return (
    <View style={{ gap: S.lg }}>
      {/* Plain View: RN positions an absolute child (the chip) against its nearest parent regardless of
          that parent's own position style, so no extra "relative" styling is needed here.
          onTouchStart/End here (not inside VehicleMap) bracket every touch that starts anywhere over the
          map+chip area, including a drag that starts just past the map's edge; see onMapTouchActiveChange
          above for why this exists. */}
      <View
        onTouchStart={() => onMapTouchActiveChange(true)}
        onTouchEnd={() => onMapTouchActiveChange(false)}
        onTouchCancel={() => onMapTouchActiveChange(false)}>
        <VehicleMap lat={lat} lng={lng} extraMarkers={placeMarkers} />
        <LocationChip approximate={approximate} updatedAt={updatedAt} onPress={() => setActionsOpen(true)} />
      </View>

      {searchExpanded ? (
        <Card style={{ gap: S.md }}>
          <Row
            title="Cerca"
            subtitle="Indirizzo, distributori o concessionarie"
            right={<IconButton icon="chevron-up" label="Comprimi ricerca" onPress={() => setSearchExpanded(false)} />}
          />
          <SearchSection query={query} onQueryChange={setQuery} onCategory={toggleCategory} search={search} />
        </Card>
      ) : (
        <SearchChip query={query} search={search} onExpand={() => setSearchExpanded(true)} onClear={clearSearch} />
      )}

      <ActionsSheet visible={actionsOpen} onClose={() => setActionsOpen(false)} lat={lat} lng={lng} />
    </View>
  );
}

// Shows the car's own reported point, not the phone's location: no location permission is requested.
//
// Jank investigation (3rd report after the cameraPosition/markers memoization below, which was correct
// but insufficient): two deeper, verified causes were found and fixed on this pass, both in map.tsx/ui.tsx
// rather than here:
//  1. Screen (src/components/ui.tsx) renders every screen's content inside a ScrollView. That ScrollView's
//     JS pan responder and the native map view's own pan/pinch gesture recognizer were both live on the
//     same touch stream, so a drag on the map made two gesture systems negotiate for it every frame —
//     the classic native-map-inside-ScrollView conflict. Fixed by giving Screen a `scrollEnabled` prop
//     that MapScreen drives from an onTouchStart/onTouchEnd pair around the map (see MapExplorer and
//     MapScreen above), suspending the outer scroll only while a touch is live on the map.
//  2. VehicleMap was a plain function component, so every keystroke in the search box (query state lives
//     in MapExplorer, a few lines up in the same tree) re-rendered it too, even though its own props
//     (lat/lng/extraMarkers) hadn't changed — extra reconciliation work competing with typing and any
//     concurrent map gesture. Wrapping it in React.memo below skips that re-render when props are equal.
// Ruled out: marker count (stays in the tens from Overpass's `out body 30` cap) and GoogleMaps.View props
// aren't the bottleneck — no change was made there.
const VehicleMap = memo(function VehicleMap({
  lat,
  lng,
  extraMarkers,
}: {
  lat: number;
  lng: number;
  extraMarkers: { coordinates: { latitude: number; longitude: number }; title: string }[];
}) {
  // cameraPosition/markers were plain object/array literals, recreated on every render (e.g. every store
  // refresh tick) even when lat/lng hadn't moved — AppleMaps.View/GoogleMaps.View treat a new reference as
  // "the camera changed" and redo native work for nothing. Memoizing on the primitive values keeps the
  // same reference across renders that don't actually move the car or change the search results.
  const cameraPosition = useMemo(() => ({ coordinates: { latitude: lat, longitude: lng }, zoom: 15 }), [lat, lng]);
  const markers = useMemo(
    () => [{ coordinates: { latitude: lat, longitude: lng }, title: 'La tua auto' }, ...extraMarkers],
    [lat, lng, extraMarkers]
  );

  // The owner asked for the map to be the dominant element on screen, not a modest band above a card:
  // ~72% of window height (up from the previous 48%) with a higher floor for short screens. The chip
  // overlays the map itself (see mapSection/LocationChip) rather than taking space below it, so this
  // height is almost the whole "map experience" the owner sees before the search section.
  // flex:1 would be the cleaner way to express "fill remaining space", but Screen (ui.tsx) renders
  // children inside a ScrollView, which can't bound a flex:1 child — hence a computed height instead.
  const { height: windowHeight } = useWindowDimensions();
  const mapHeight = Math.max(windowHeight * 0.72, 520);

  return (
    <View style={[styles.mapWrap, { height: mapHeight }]}>
      {Platform.OS === 'ios' ? (
        <AppleMaps.View style={styles.map} cameraPosition={cameraPosition} markers={markers} />
      ) : (
        <GoogleMaps.View style={styles.map} cameraPosition={cameraPosition} markers={markers} />
      )}
    </View>
  );
});

function LocationChip({
  approximate,
  updatedAt,
  onPress,
}: {
  approximate: boolean | null;
  updatedAt: string | null;
  onPress: () => void;
}) {
  const detail = [approximate ? 'posizione approssimativa' : null, updatedAt ? `aggiornata il ${formatDateTime(updatedAt)}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `Posizione attuale. ${detail}` : 'Posizione attuale'}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}>
      <Ionicons name="location" size={16} color={C.accent} />
      <View style={{ flex: 1 }}>
        <T style={styles.chipTitle}>Posizione attuale</T>
        {detail ? (
          <T style={styles.chipDetail} numberOfLines={1}>
            {detail}
          </T>
        ) : null}
      </View>
      <Ionicons name="chevron-down" size={14} color={C.textMuted} />
    </Pressable>
  );
}

// Collapsed resting state of the search section (owner feedback: it was a bar that was always visible
// and took up space). Same pill look as LocationChip, but laid out inline below the map rather than
// overlaid on it, since it already sat there before this change. Tapping the chip body expands the full
// search panel (SearchSection); when a category/address search is active, the chip itself shows what's
// active and offers a direct clear without needing to expand first.
function SearchChip({
  query,
  search,
  onExpand,
  onClear,
}: {
  query: string;
  search: SearchState;
  onExpand: () => void;
  onClear: () => void;
}) {
  const activeLabel =
    search.status === 'idle' ? null : search.kind === 'fuel' ? 'Distributori' : search.kind === 'dealer' ? 'Concessionarie' : query.trim();
  const isActive = activeLabel !== null && activeLabel !== '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isActive ? `Ricerca attiva: ${activeLabel}. Tocca per espandere.` : 'Cerca indirizzi o luoghi'}
      onPress={onExpand}
      style={({ pressed }) => [styles.searchChip, pressed && styles.chipPressed]}>
      <Ionicons name={isActive ? 'search' : 'search-outline'} size={18} color={isActive ? C.accent : C.textMuted} />
      <T style={[styles.chipTitle, { flex: 1 }]} numberOfLines={1}>
        {isActive ? activeLabel : 'Cerca indirizzi o luoghi'}
      </T>
      {isActive ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Annulla ricerca" onPress={onClear} hitSlop={10}>
          <Ionicons name="close-circle" size={18} color={C.textMuted} />
        </Pressable>
      ) : null}
      <Ionicons name="chevron-up" size={14} color={C.textMuted} />
    </Pressable>
  );
}

// The actions the separate "Posizione attuale" card used to expose below the map now live behind the
// chip, so tapping it doesn't lose "Apri in Mappe"/"Raggiungi"/"Condividi".
function ActionsSheet({ visible, onClose, lat, lng }: { visible: boolean; onClose: () => void; lat: number; lng: number }) {
  const mapsUrl =
    Platform.OS === 'ios'
      ? `https://maps.apple.com/?q=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SheetPanel style={styles.sheet}>
          <T variant="h3">Posizione attuale</T>
          <T variant="value">{`${lat.toFixed(5)}, ${lng.toFixed(5)}`}</T>
          <Button
            label="Apri in Mappe"
            icon="map"
            onPress={() => {
              onClose();
              Linking.openURL(mapsUrl);
            }}
          />
          <Button
            label="Raggiungi"
            icon="walk"
            kind="secondary"
            onPress={() => {
              onClose();
              Linking.openURL(directionsUrl);
            }}
          />
          <Button
            label="Condividi"
            icon="share-social"
            kind="secondary"
            onPress={() => {
              onClose();
              Share.share({ message: `La mia auto è qui: https://www.google.com/maps/search/?api=1&query=${lat},${lng}` });
            }}
          />
        </SheetPanel>
      </View>
    </Modal>
  );
}

function SearchSection({
  query,
  onQueryChange,
  onCategory,
  search,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onCategory: (kind: 'fuel' | 'dealer') => void;
  search: SearchState;
}) {
  const openResult = (r: PlaceResult) => {
    const url =
      Platform.OS === 'ios'
        ? `https://maps.apple.com/?q=${r.lat},${r.lng}`
        : `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`;
    Linking.openURL(url);
  };

  const isActive = (kind: 'fuel' | 'dealer') => search.status !== 'idle' && search.kind === kind;

  return (
    <View style={{ gap: S.md }}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={C.textMuted} />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder="Cerca un indirizzo o un luogo"
          placeholderTextColor={C.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel="Cerca un indirizzo o un luogo"
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Cancella ricerca" onPress={() => onQueryChange('')} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={C.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.chipsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: isActive('fuel') }}
          onPress={() => onCategory('fuel')}
          style={({ pressed }) => [styles.categoryChip, isActive('fuel') && styles.categoryChipActive, pressed && styles.chipPressed]}>
          <MaterialCommunityIcons name="gas-station-outline" size={16} color={isActive('fuel') ? C.onInk : C.text} />
          <T style={[styles.categoryLabel, isActive('fuel') && { color: C.onInk }]}>Distributori</T>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: isActive('dealer') }}
          onPress={() => onCategory('dealer')}
          style={({ pressed }) => [styles.categoryChip, isActive('dealer') && styles.categoryChipActive, pressed && styles.chipPressed]}>
          <Ionicons name="storefront-outline" size={16} color={isActive('dealer') ? C.onInk : C.text} />
          <T style={[styles.categoryLabel, isActive('dealer') && { color: C.onInk }]}>Concessionarie</T>
        </Pressable>
      </View>

      {search.status === 'loading' ? (
        <View style={styles.searchStatus}>
          <ActivityIndicator color={C.accent} />
          <T variant="caption">Ricerca in corso…</T>
        </View>
      ) : null}

      {search.status === 'error' ? (
        <T variant="caption" style={{ color: C.danger }}>
          {search.message}
        </T>
      ) : null}

      {search.status === 'done' && search.results.length === 0 ? (
        <T variant="caption">Nessun risultato trovato nelle vicinanze.</T>
      ) : null}

      {search.status === 'done' && search.results.length > 0 ? (
        <View style={{ gap: S.xs }}>
          {search.results.map((r) => (
            <Row key={r.id} icon="location-outline" title={r.label} onPress={() => openResult(r)} chevron />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Height is set inline (see VehicleMap) based on screen size; only the shape stays fixed here.
  mapWrap: { borderRadius: R.md, overflow: 'hidden' },
  map: { flex: 1 },
  chip: {
    position: 'absolute',
    top: S.md,
    left: S.md,
    right: S.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: R.pill,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    shadowColor: C.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  chipPressed: { opacity: 0.7 },
  chipTitle: { fontSize: 14, fontWeight: '700' },
  chipDetail: { fontSize: 12, color: C.textSecondary },
  // Same pill shape/shadow as `chip` (LocationChip) but laid out inline, not overlaid on the map.
  searchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    backgroundColor: C.surfaceRaised,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: S.md,
    paddingVertical: S.md,
    shadowColor: C.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: C.scrim },
  sheet: { paddingBottom: 48, width: '100%', maxWidth: 520, alignSelf: 'center' },
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
  chipsRow: { flexDirection: 'row', gap: S.sm },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.xs,
    backgroundColor: C.surface,
    borderRadius: R.pill,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
  },
  categoryChipActive: { backgroundColor: C.ink },
  categoryLabel: { fontSize: 14, fontWeight: '600' },
  searchStatus: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
});
