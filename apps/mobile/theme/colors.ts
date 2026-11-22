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
  fieldBorder: 'rgba(255,255,255,0.13)', // the tap-to-pick row and inputs (FieldRow)
  darkBg: '#0C0A16',
  onGradientDim: 'rgba(255,255,255,0.72)', // captions and subs on a gradient card

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

  // Grounds and plates (2.8.7, gaps row 121: written out in components before)
  bgDeep: '#151129',                    // the screen gradient's lower stop
  tabBar: '#100E1C',
  scrim: '#08060F',                     // behind a modal; toast and peek shadows
  sheetTop: '#241E42',                  // sheet gradient, and the chart tooltip plate
  sheetBottom: '#151024',               // sheet gradient, keyboard bar
  sheetBg: '#1B1530',                   // the date picker's plate
  stripBg: '#1B1730',                   // refresh and server-waking strips
  toastTop: '#282242',
  toastBottom: '#18132A',
  rowLifted: '#2A2350',                 // a row held up while dragging
  chartRing: '#211E33',                 // the ring round a chart's end dot, the card behind it

  // Brand series
  glow: '#6D5CFF',                      // brand glow and shadow
  glowDeep: '#6A4CFF',
  brandLight: '#8B7BFF',                // gradients.brand's stops
  brandDeep: '#6D5CF6',
  seriesViolet: '#A394FF',              // violet marks and selected icons
  selectedFill: '#7C6BF8',              // a selected preset chip
  successDeep: '#12B981',               // gradients.health's lower stop, its glow
  dangerDeep: '#F5525C',                // gradients.danger's lower stop, its glow
  tealLight: '#5EEAD4',

  // Extended palette — extra category / goal chip tints (gradients in gradients.ts)
  teal: '#2DD4BF',
  pink: '#F472B6',
  lime: '#A3E635',
  orange: '#FB923C',
  indigo: '#818CF8',
} as const

export type ColorToken = keyof typeof colors

/** A token at an alpha: `withAlpha(colors.primary, 0.55)`. Keeps tinted rgba out of components. */
export const withAlpha = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};
