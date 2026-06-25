export const colors = {
  // Text / ink
  ink: '#101828',
  inkSecondary: '#1F2937',

  // Neutrals
  gray700: '#374151',
  gray600: '#4A5563',
  gray500: '#6A7282',
  gray400: '#99A1BF',
  gray300: '#D1D5DB',
  line: '#E5E7EB',
  lineSoft: '#EEF1F4',

  // Surfaces
  bg: '#F7F8FA',
  surface: '#FFFFFF',

  // Brand
  indigo: '#615FFF',
  indigoInk: '#372AAC',
  violet: '#7B68EE',
  violetSoft: '#F0E9FF',

  // Semantic
  green: '#00C950',
  greenInk: '#047A36',
  greenSoft: '#E7F8EE',
  red: '#FB2C36',
  redInk: '#B1060F',
  redSoft: '#FDEAEB',
  orange: '#FF6900',
  orangeSoft: '#FFF0E5',
  blue: '#2B7FFF',
  blueSoft: '#E9F1FF',
} as const

export type ColorToken = keyof typeof colors;