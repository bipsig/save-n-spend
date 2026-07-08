// Brand palette — single source of truth for color.
// Named by ROLE (primary/success/danger…), not by hue, so the same token can
// resolve to a different hex in dark mode later. Never reference raw hex in a component.
// `as const` freezes these to literal types so consumers get autocomplete + type-safety.

export const colors = {
  // Text / ink
  ink: '#101828',
  inkSecondary: '#1F2937',

  // Neutrals
  gray700: '#374151',
  gray600: '#4A5563',
  gray500: '#6A7282',
  gray400: '#99A1AF',
  gray300: '#D1D5DB',
  line: '#E5E7EB',
  lineSoft: '#EEF1F4',

  // Surfaces
  bg: '#F3F1FB', // soft lavender tint (Figma app background)
  surface: '#FFFFFF',
  surface2: '#F3F4F6',

  // Brand
  primary: '#615FFF',
  primaryInk: '#372AAC',
  accent: '#7B68EE', // "primary-2" in the Figma — decorative brand accent
  accentLight: '#9F8FFF', // gradient end for purple hero cards
  accentSoft: '#F0E9FF',

  // Semantic — base / ink (dark text) / soft (tinted background)
  success: '#00C950',
  successInk: '#047A36',
  successSoft: '#E7F8EE',
  danger: '#FB2C36',
  dangerInk: '#B1060F',
  dangerSoft: '#FDEAEB',
  warning: '#FF6900',
  warningSoft: '#FFF0E5',
  info: '#2B7FFF',
  infoSoft: '#E9F1FF',

  // Reserved for dark mode (not used yet)
  darkBg: '#1A192B',
} as const

export type ColorToken = keyof typeof colors
