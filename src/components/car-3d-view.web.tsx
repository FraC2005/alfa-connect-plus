import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { T } from '@/components/ui';
import { C, R, S } from '@/constants/theme';

// Web build only: expo-gl is a native module and @react-three/fiber/native was only verified here on a
// development build (no browser available while building this feature) — see car-3d-view.tsx for the
// full reasoning. Rather than risk shipping a broken web bundle, this platform-specific file keeps an
// honest text card instead, same pattern as map.web.tsx for the map tab.
export function Car3DView() {
  return (
    <View style={styles.wrap}>
      <Ionicons name="cube-outline" size={28} color={C.textMuted} />
      <T variant="secondary">Il modellino 3D interattivo è disponibile solo da mobile (richiede una development build).</T>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: 160, borderRadius: R.sm, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: S.sm, padding: S.lg },
});
