import '@/global.css';

import { Platform } from 'react-native';

// Light theme, "inspired by" a flat vehicle-app look: white page, flat light-grey cards, near-black text,
// one blue accent, black for the primary/active control. Contrast (WCAG) of the main text pairs:
// text on bg 18.9, text on surface 16.9, textSecondary on bg 6.7 / on surface 6.0,
// textMuted on bg 5.2 / on surface 4.7, accent on bg 5.9 / on surface 5.3,
// success/warning/danger on bg >= 5.7 / on surface >= 5.1, white on ink 18.9, white on heroTop 15.
export const C = {
  bg: '#FFFFFF',
  surface: '#F2F2F2', // flat card
  surface2: '#E4E4E4', // inner chips, progress tracks
  surfaceRaised: '#FFFFFF', // fields and icon wells sitting on a grey card, and bottom sheets
  border: '#E0E0E0',
  text: '#111111',
  textSecondary: '#585C61',
  textMuted: '#686D73',
  accent: '#1A5FCC',
  accentSoft: 'rgba(26,95,204,0.28)', // de-emphasised accent (non-selected chart bars)
  ink: '#111111', // primary / active button fill
  onInk: '#FFFFFF',
  onAccent: '#FFFFFF',
  success: '#17753F',
  warning: '#A24A00',
  danger: '#C0261C',
  dangerSoft: '#FBE9E7',
  switchOff: '#C9CCD0',
  scrim: 'rgba(0,0,0,0.4)',
  // Vehicle hero: deep navy at the top fading to the page colour.
  heroTop: '#16254A',
  heroText: '#FFFFFF',
  heroTextSecondary: 'rgba(255,255,255,0.8)',
  heroControl: 'rgba(255,255,255,0.16)',
  alfaRed: '#9B1C1C',
  headlight: '#FFF6D5',
  shadow: '#000000',
} as const;

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const R = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

export const Font = Platform.select({
  web: 'var(--font-display)',
  ios: 'system-ui',
  default: 'normal',
});

export const MaxContentWidth = 720;
