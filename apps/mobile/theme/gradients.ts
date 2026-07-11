// Gradient definitions for LinearGradient (expo-linear-gradient).
// Vivid on the dark ground — these are the "colored glass" hero surfaces.
// Each value is the array of stop colors passed to <LinearGradient colors={...} />.

import type { ColorToken } from './colors'

export const gradients = {
  brand: ['#8B7BFF', '#6D5CF6'],  // violet — pill buttons, CTAs, FAB, month summary
  health: ['#2FE08A', '#12B981'], // green — Finance Health Score banner
} as const

export type GradientToken = keyof typeof gradients

// ---- Category / icon chip gradients (spec .g-blue … .g-red) -----------------
// A chip is a vivid 150° gradient with a DEEP ink glyph and a glow shadow in
// the chip's own hue. Keyed by tint name; `chipTintFor` maps the semantic
// color tokens the data layer already uses (category.color / goal.color).

export type ChipTint = 'blue' | 'green' | 'violet' | 'amber' | 'red'

export const chipGradients: Record<ChipTint, readonly [string, string]> = {
  blue: ['#7FB4FF', '#3E7EF0'],
  green: ['#4DFFB0', '#17C98B'],
  violet: ['#B0A2FF', '#7C66FF'],
  amber: ['#FFCE7E', '#F59A2D'],
  red: ['#FF9AA0', '#F5525C'],
}

// Deep ink for the glyph sitting on each gradient (spec: color:#04140d etc.)
export const chipInk: Record<ChipTint, string> = {
  blue: '#08101F',
  green: '#04140D',
  violet: '#0D0824',
  amber: '#1D1103',
  red: '#1F0608',
}

// Glow shadow color per tint (spec: box-shadow 0 5px 15px rgba(...,.4))
export const chipGlow: Record<ChipTint, string> = {
  blue: 'rgba(80,140,255,0.9)',
  green: 'rgba(23,201,139,0.9)',
  violet: 'rgba(124,102,255,0.9)',
  amber: 'rgba(245,154,45,0.9)',
  red: 'rgba(245,82,92,0.9)',
}

// Progress-bar fills (spec .track > i gradients) — same hues, bar-tuned stops.
export const barGradients: Record<ChipTint, readonly [string, string]> = {
  blue: ['#7FB4FF', '#3E7EF0'],
  green: ['#3AFFB0', '#19D08E'],
  violet: ['#B0A2FF', '#7C66FF'],
  amber: ['#FFCE7E', '#F59A2D'],
  red: ['#FF9AA0', '#F5525C'],
}

// Semantic color token → chip tint. The mock data colors goals/categories with
// role tokens (success/info/…); the chips render them as the spec gradients.
const TINT_BY_TOKEN: Partial<Record<ColorToken, ChipTint>> = {
  success: 'green',
  danger: 'red',
  info: 'blue',
  warning: 'amber',
  accent: 'violet',
  primary: 'violet',
}

export const chipTintFor = (token?: string): ChipTint =>
  TINT_BY_TOKEN[(token ?? '') as ColorToken] ?? 'violet'
