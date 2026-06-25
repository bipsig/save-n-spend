import { colors } from './colors'
import { spacing, radius } from './spacing'
import { fontFamily, fontSize } from './typography'
import { shadows } from './shadows'

export const theme = {
  colors,
  spacing,
  radius,
  fontFamily,
  fontSize,
  shadows,
} as const;

export { colors, spacing, radius, fontFamily, fontSize, shadows }

export type { ColorToken } from './colors'
export type { SpacingToken, RadiusToken } from './spacing'
export type { FontWeightToken, FontSizeToken } from './typography'
export type { ShadowToken } from './shadows'