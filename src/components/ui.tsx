import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, Font, MaxContentWidth, R, S } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
type CommunityIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Page container. With `hero` the page starts with a full-bleed gradient header that draws under the status
 * bar (the Hero handles the top inset); without it the page content sits below the top safe area.
 */
export function Screen({
  title,
  subtitle,
  right,
  hero,
  children,
  onRefresh,
  refreshing = false,
  scrollEnabled = true,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  hero?: ReactNode;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  // Lets a screen that embeds a native gesture surface (e.g. a map) suspend the outer ScrollView's own
  // pan responder while the user is touching that surface, so the two don't compete for the same drag
  // (see src/app/map.tsx, which toggles this while a touch is active on the map view).
  scrollEnabled?: boolean;
}) {
  const scroll = (
    <ScrollView
      contentContainerStyle={styles.scroll}
      scrollEnabled={scrollEnabled}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={hero ? C.heroText : C.textSecondary} /> : undefined
      }>
      {hero}
      <View style={styles.inner}>
        {title ? (
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <T variant="title">{title}</T>
              {subtitle ? <T variant="secondary">{subtitle}</T> : null}
            </View>
            {right}
          </View>
        ) : null}
        {children}
      </View>
    </ScrollView>
  );

  if (hero) return <View style={styles.screen}>{scroll}</View>;
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      {scroll}
    </SafeAreaView>
  );
}

/** Deep-blue gradient that fades into the page colour; children are centred and width-limited like the page. */
export function Hero({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={[C.heroTop, C.heroTop, C.bg]} locations={[0, 0.5, 1]} style={{ paddingTop: insets.top + S.md }}>
      {/* Extends the top colour above the content so an iOS overscroll bounce doesn't reveal white. */}
      <View pointerEvents="none" style={styles.heroOverscroll} />
      <View style={styles.heroInner}>{children}</View>
    </LinearGradient>
  );
}

type Variant = 'display' | 'title' | 'h2' | 'h3' | 'body' | 'secondary' | 'caption' | 'value' | 'big';

export function T({ variant = 'body', style, ...props }: TextProps & { variant?: Variant }) {
  return <Text {...props} style={[styles.text, textStyles[variant], style]} />;
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && styles.pressed]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

/**
 * Compact status card: bold title, small subtitle, icons bottom-left and a big value bottom-right.
 * Pass '—' as `value` when the data is missing; it is never filled in with a guess.
 */
export function TileCard({
  title,
  subtitle,
  subtitleColor,
  value,
  unit,
  icon,
  footer,
  onPress,
}: {
  title: string;
  subtitle?: string;
  subtitleColor?: string;
  value?: string;
  unit?: string;
  icon?: ReactNode;
  footer?: ReactNode;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={{ gap: 2 }}>
        <T style={styles.tileTitle}>{title}</T>
        {subtitle ? (
          <T variant="caption" style={subtitleColor ? { color: subtitleColor } : undefined}>
            {subtitle}
          </T>
        ) : null}
      </View>
      <View style={styles.tileBottom}>
        <View style={styles.tileIcons}>{icon}</View>
        {value !== undefined ? (
          // Shrinks to fit (long odometer / service km) instead of overlapping the icons.
          <T variant="big" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.tileValue}>
            {value}
            {unit ? <T variant="secondary"> {unit}</T> : null}
          </T>
        ) : null}
      </View>
      {footer}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.card, styles.tile, pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }
  return <View style={[styles.card, styles.tile]}>{content}</View>;
}

/** Square-ish action button (lock, unlock, ...). `active` = black fill, as the current state. */
export function SquareAction({
  icon,
  label,
  active,
  disabled,
  onPress,
}: {
  icon: CommunityIconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.square, active && styles.squareActive, (pressed || disabled) && styles.pressed]}>
      <MaterialCommunityIcons name={icon} size={24} color={active ? C.onInk : C.text} />
    </Pressable>
  );
}

/** Icon-only button with a mandatory accessible label. */
export function IconButton({
  icon,
  label,
  onPress,
  color = C.textMuted,
  size = 18,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={14} // 18 px icon + 14 px each side = 46 px touch target
      onPress={onPress}
      style={({ pressed }) => [style, pressed && styles.pressed]}>
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

/** Bottom-sheet look (rounded top, soft shadow). The grabber is for real sheets only: pass grabber={false} when inline. */
export function SheetPanel({ children, style, grabber = true }: { children: ReactNode; style?: ViewStyle; grabber?: boolean }) {
  return (
    <View style={[styles.sheet, style]}>
      {grabber ? <View style={styles.grabber} /> : null}
      {children}
    </View>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: S.sm }}>
      <View style={styles.sectionHeader}>
        <T variant="h3">{title}</T>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Row({
  icon,
  iconColor = C.textSecondary,
  title,
  subtitle,
  right,
  onPress,
  chevron,
  role = 'button',
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  role?: 'button' | 'link';
}) {
  const content = (
    <>
      {icon ? (
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T>{title}</T>
        {subtitle ? <T variant="caption">{subtitle}</T> : null}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={16} color={C.textMuted} /> : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable accessibilityRole={role} accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }
  return <View style={styles.row}>{content}</View>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function Button({
  label,
  icon,
  onPress,
  kind = 'primary',
  disabled,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const bg = kind === 'primary' ? C.ink : kind === 'danger' ? C.dangerSoft : C.surface2;
  const fg = kind === 'primary' ? C.onInk : kind === 'danger' ? C.danger : C.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg }, (pressed || disabled) && styles.pressed]}>
      {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <T style={{ color: fg, fontWeight: '600' }}>{label}</T>
    </Pressable>
  );
}

export function Progress({ value, color = C.ink, height = 4 }: { value: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={[styles.track, { height, borderRadius: height }]}>
      <View style={{ width: `${pct}%`, height, borderRadius: height, backgroundColor: color }} />
    </View>
  );
}

// react-native-web paints the active thumb with its own default unless this web-only prop is set
const webSwitchProps = { activeThumbColor: C.onAccent } as object;

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      accessibilityLabel={label}
      trackColor={{ false: C.switchOff, true: C.accent }}
      thumbColor={C.onInk}
      ios_backgroundColor={C.switchOff}
      {...webSwitchProps}
    />
  );
}

export function Input({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: S.xs }}>
      <T variant="caption">{label}</T>
      <TextInput placeholderTextColor={C.textMuted} {...props} style={[styles.input, props.style]} />
    </View>
  );
}

export function Badge({ label, color = C.accent }: { label: string; color?: string }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <T variant="caption" style={{ color, fontWeight: '600' }}>
        {label}
      </T>
    </View>
  );
}

export function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T variant="caption">{label}</T>
      <T variant="value">
        {value}
        {unit ? <T variant="secondary"> {unit}</T> : null}
      </T>
    </View>
  );
}

const textStyles = StyleSheet.create({
  display: { fontSize: 56, lineHeight: 58, fontWeight: '800', letterSpacing: -1.5, textTransform: 'uppercase', color: C.heroText },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 15 },
  secondary: { fontSize: 15, color: C.textSecondary },
  caption: { fontSize: 13, color: C.textSecondary },
  value: { fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
  big: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 48 },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: S.lg, gap: S.xl },
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingTop: S.lg, gap: S.md },
  heroOverscroll: { position: 'absolute', top: -1000, left: 0, right: 0, height: 1000, backgroundColor: C.heroTop },
  heroInner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: S.lg },
  text: { color: C.text, fontFamily: Font },
  card: { backgroundColor: C.surface, borderRadius: R.md, padding: S.lg, gap: S.md },
  tile: { flex: 1, minHeight: 128, justifyContent: 'space-between' },
  tileTitle: { fontSize: 16, fontWeight: '700' },
  // Wraps so a long value drops under the icons instead of overlapping them.
  tileBottom: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: S.xs },
  tileIcons: { flexDirection: 'row', alignItems: 'center', gap: S.sm, flexShrink: 0 },
  tileValue: { flexShrink: 1, marginLeft: 'auto', textAlign: 'right' },
  square: { flex: 1, height: 60, borderRadius: R.sm + 2, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  squareActive: { backgroundColor: C.ink },
  sheet: {
    backgroundColor: C.surfaceRaised,
    borderTopLeftRadius: R.lg,
    borderTopRightRadius: R.lg,
    padding: S.xl,
    gap: S.md,
    shadowColor: C.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: C.surface2, alignSelf: 'center', marginBottom: S.sm },
  pressed: { opacity: 0.6 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.xs },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border },
  button: { flexDirection: 'row', gap: S.sm, alignItems: 'center', justifyContent: 'center', borderRadius: R.sm + 2, minHeight: 48, paddingHorizontal: S.xl },
  track: { backgroundColor: C.surface2, overflow: 'hidden' },
  input: { backgroundColor: C.surfaceRaised, borderRadius: R.sm, color: C.text, paddingHorizontal: S.md, paddingVertical: 11, fontSize: 15, borderWidth: 1, borderColor: C.border },
  badge: { borderWidth: 1, borderRadius: R.pill, paddingHorizontal: S.sm, paddingVertical: 2 },
});
