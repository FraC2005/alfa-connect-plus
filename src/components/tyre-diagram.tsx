import { StyleSheet, View } from 'react-native';
import { Rect, Svg } from 'react-native-svg';

import { T } from '@/components/ui';
import { C, S } from '@/constants/theme';
import type { Tyres } from '@/services/types';

const DASH = '—';

// Same 1-decimal formatting used for these fields elsewhere (index.tsx, warnings.tsx).
const decimal = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const DIAGRAM_W = 96;
const DIAGRAM_H = 162;
// Fractions of DIAGRAM_W / DIAGRAM_H; drawn once and mirrored for the four wheel positions.
const BODY = { x: 0.3, y: 0.08, w: 0.4, h: 0.84 };
const WHEEL = { w: 0.2, h: 0.18 };
const WHEEL_X = { left: 0.03, right: 1 - 0.03 - WHEEL.w };
const WHEEL_Y = { top: 0.12, bottom: 1 - 0.12 - WHEEL.h };

/** Top-down silhouette (body + 4 wheels) with the real pressure next to each wheel; '—' when that position is unknown. */
export function TyreDiagram({ tyres }: { tyres: Tyres | null }) {
  // No invented per-wheel values: when `tyres` is null every position reads DASH instead of a guess.
  const corners: { key: keyof Tyres; top: boolean; left: boolean }[] = [
    { key: 'fl', top: true, left: true },
    { key: 'fr', top: true, left: false },
    { key: 'rl', top: false, left: true },
    { key: 'rr', top: false, left: false },
  ];
  const label = (bar: number | null) => (bar !== null ? decimal(bar) : DASH);
  const color = (warning: boolean | null) => (warning === true ? C.warning : C.textSecondary);
  const names: Record<keyof Tyres, string> = { fl: 'anteriore sinistra', fr: 'anteriore destra', rl: 'posteriore sinistra', rr: 'posteriore destra' };
  const summary = tyres
    ? corners.map((c) => `ruota ${names[c.key]} ${label(tyres[c.key].bar)} bar`).join(', ')
    : 'dato non disponibile per nessuna ruota';

  return (
    <View accessible accessibilityLabel={`Pressione pneumatici: ${summary}`} style={styles.tyreWrap}>
      <View style={{ width: DIAGRAM_W, height: DIAGRAM_H }} importantForAccessibility="no-hide-descendants">
        <Svg width={DIAGRAM_W} height={DIAGRAM_H} style={StyleSheet.absoluteFill}>
          <Rect x={DIAGRAM_W * BODY.x} y={DIAGRAM_H * BODY.y} width={DIAGRAM_W * BODY.w} height={DIAGRAM_H * BODY.h} rx={14} fill={C.surface2} />
          {corners.map((c) => (
            <Rect
              key={c.key}
              x={DIAGRAM_W * (c.left ? WHEEL_X.left : WHEEL_X.right)}
              y={DIAGRAM_H * (c.top ? WHEEL_Y.top : WHEEL_Y.bottom)}
              width={DIAGRAM_W * WHEEL.w}
              height={DIAGRAM_H * WHEEL.h}
              rx={4}
              fill={tyres ? color(tyres[c.key].warning) : C.textMuted}
            />
          ))}
        </Svg>
        {corners.map((c) => (
          <View
            key={c.key}
            style={[
              styles.wheelLabel,
              { width: DIAGRAM_W * WHEEL.w + 16 },
              c.top ? { top: 2 } : { bottom: 2 },
              c.left ? { left: -8 } : { right: -8, alignItems: 'flex-end' },
            ]}>
            <T variant="caption" style={{ color: color(tyres?.[c.key].warning ?? null), fontWeight: '700' }}>
              {label(tyres?.[c.key].bar ?? null)}
            </T>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tyreWrap: { alignItems: 'center', paddingTop: S.sm },
  wheelLabel: { position: 'absolute' },
});
