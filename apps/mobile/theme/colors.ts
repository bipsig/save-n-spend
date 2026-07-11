// Brand palette — single source of truth for color. MIDNIGHT GLASS (dark-first).
// Named by ROLE, not hue. Screens read these tokens, so changing values here
// restyles the whole app. `surface` stays white for foreground-on-color usages
// (text/icons on gradients); card/input/chip backgrounds use the translucent
// `glass` / `surface2` tokens.

export const colors = {
  // Text / ink (light, on the dark ground)
  ink: '#F5F4FC',
  inkSecondary: '#D8D5E8',
  inkDim: 'rgba(245,244,252,0.58)',     // spec ink-dim — subs, meta, captions

  // Neutrals — muted, tuned for dark
  gray700: '#BAB6CE',
  gray600: '#A29EB8',
  gray500: '#8A879F',
  gray400: '#706D86',
  gray300: '#524F68',
  line: 'rgba(255,255,255,0.10)',
  lineSoft: 'rgba(255,255,255,0.06)',

  // Surfaces
  bg: '#0C0A16',                        // deep charcoal-violet ground
  surface: '#FFFFFF',                   // opaque white FOREGROUND (on colored/gradient surfaces)
  surface2: 'rgba(255,255,255,0.06)',   // subtle glass (inputs, chips, search)
  glass: 'rgba(255,255,255,0.10)',      // card glass fill
  glassBorder: 'rgba(255,255,255,0.14)',
  darkBg: '#0C0A16',

  // Brand — brightened for dark; Ink variants stay deep (used on vivid gradients)
  primary: '#9B8CFF',
  primaryInk: '#4B3BB8',
  accent: '#7B68EE',
  accentLight: '#9F8FFF',
  accentSoft: 'rgba(155,140,255,0.18)',

  // Semantic — base (bright) / ink (deep, for gradient chips + tracks) / soft (translucent tint)
  success: '#34E0A1',
  successInk: '#0E7A50',
  successSoft: 'rgba(52,224,161,0.16)',
  danger: '#FF6B74',
  dangerInk: '#B1060F',
  dangerSoft: 'rgba(255,107,116,0.16)',
  warning: '#FFB15C',
  warningSoft: 'rgba(255,177,92,0.16)',
  info: '#68A8FF',
  infoSoft: 'rgba(104,168,255,0.16)',
} as const

export type ColorToken = keyof typeof colors
