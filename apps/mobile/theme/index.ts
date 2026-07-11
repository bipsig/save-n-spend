import { colors } from './colors'
import { spacing, radius } from './spacing'
import { fontWeight, fontSize } from './typography'
import { shadows } from './shadows'
import { gradients, chipGradients, chipInk, barGradients } from './gradients'

export const theme = {
  colors,
  spacing,
  radius,
  fontWeight,
  fontSize,
  shadows,
  gradients,
} as const;

export { colors, spacing, radius, fontWeight, fontSize, shadows, gradients, chipGradients, chipInk, barGradients }

export type { ColorToken } from './colors'
export type { SpacingToken, RadiusToken } from './spacing'
export type { FontWeightToken, FontSizeToken } from './typography'
export type { ShadowToken } from './shadows'
export type { GradientToken, ChipTint } from './gradients'
