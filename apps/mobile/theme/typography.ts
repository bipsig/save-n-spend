import type { TextStyle } from 'react-native';

// System font (SF Pro on iOS, Roboto on Android) — per the Midnight Glass spec
// (`-apple-system / SF Pro`). Hierarchy is carried by WEIGHT, not by family:
// 800 titles/amounts · 700 names · 600 meta · 400 body.
export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  black: '800',
} as const satisfies Record<string, TextStyle['fontWeight']>;

// Spec type scale, converted to DEVICE points: the spec mock is drawn in a
// 302px phone frame, so its px values are scaled ×~1.25 for a real ~390pt
// screen — otherwise the app reads smaller/tighter than the approved mock.
// label ~13 caps · sub/meta 15 · card name 18 · tile amount 21 ·
// screen title / card hero 30 · large hero 33.
export const fontSize = {
  xs: 13,
  sm: 15,
  md: 18,
  lg: 21,
  xl: 30,
  '2xl': 33,
} as const;

export type FontWeightToken = keyof typeof fontWeight;
export type FontSizeToken = keyof typeof fontSize;
