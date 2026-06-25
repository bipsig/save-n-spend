export const fontFamily = {
  regular: 'Lato_400Regular',
  bold: 'Lato_700Bold',
  black: 'Lato_900Black',
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 16,
  lg: 19,
  xl: 24,
  '2xl': 32,
} as const;

export type FontWeightToken = keyof typeof fontFamily;
export type FontSizeToken = keyof typeof fontSize;