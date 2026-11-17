import { colors } from './colors'
import { spacing, radius, touchTarget } from './spacing'
import { fontWeight, fontSize, caps } from './typography'
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

export { colors, spacing, radius, touchTarget, fontWeight, fontSize, caps, shadows, gradients, chipGradients, chipInk, barGradients }
export { chartPalette, chartOthers, incomeColor, expenseColor, chartValueColor, chartScrubLine, chartTooltip, chartLegend } from './charts'

export type { ColorToken } from './colors'
export type { SpacingToken, RadiusToken } from './spacing'
export type { FontWeightToken, FontSizeToken, CapsSize } from './typography'
export type { ShadowToken } from './shadows'
export type { GradientToken, ChipTint } from './gradients'
