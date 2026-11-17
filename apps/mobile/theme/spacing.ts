export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

// Spec radii ×1.25 device scale: icon chip 15 · CTA 20 · card 26 · pill 999.
export const radius = {
  sm: 15,
  md: 20,
  lg: 26,
  full: 9999,
} as const;

// Smallest tap area for anything pressable (Apple HIG). Smaller visuals reach it with hitSlop.
export const touchTarget = 44;

export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radius;