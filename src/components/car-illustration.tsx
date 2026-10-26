import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { C } from '@/constants/theme';

// The hero car photo lives in this one constant: to swap the picture, change `source`, `ratio` (height / width),
// `alt` and the headlight centres below (fractions of the photo, measured on the cutout). Credits: Profilo > Crediti.
const HERO_PHOTO = {
  source: require('../../assets/images/giulia-veloce-vesuvio.webp'),
  ratio: 856 / 1600,
  alt: 'Alfa Romeo Giulia Veloce grigia vista di tre quarti anteriore',
  headlights: [
    { x: 0.40, y: 0.59, r: 0.09 },
    { x: 0.053, y: 0.52, r: 0.045 },
  ],
};

// Extra room under the photo (as a fraction of its height) for the ground shadow.
const SHADOW_ROOM = 0.1;

export function CarIllustration({ width = 340, lightsOn = false }: { width?: number; lightsOn?: boolean }) {
  const photoHeight = width * HERO_PHOTO.ratio;
  const height = photoHeight * (1 + SHADOW_ROOM);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="shadow" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={C.shadow} stopOpacity="0.35" />
            <Stop offset="1" stopColor={C.shadow} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx={width * 0.5} cy={photoHeight * 0.95} rx={width * 0.47} ry={photoHeight * 0.09} fill="url(#shadow)" />
      </Svg>

      <Image
        source={HERO_PHOTO.source}
        contentFit="contain"
        accessible
        accessibilityLabel={HERO_PHOTO.alt}
        style={{ width, height: photoHeight }}
      />

      {/* Always mounted so the 300 ms blink only toggles opacity; drawn over the photo so the glow lights it. */}
      <Svg width={width} height={height} style={[StyleSheet.absoluteFill, { opacity: lightsOn ? 1 : 0 }]} pointerEvents="none">
        <Defs>
          <RadialGradient id="beam" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={C.headlight} stopOpacity="0.95" />
            <Stop offset="1" stopColor={C.headlight} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        {HERO_PHOTO.headlights.map((h) => (
          <Ellipse key={h.x} cx={width * h.x} cy={photoHeight * h.y} rx={width * h.r} ry={width * h.r * 0.55} fill="url(#beam)" />
        ))}
      </Svg>
    </View>
  );
}
