// Gradient definitions for LinearGradient (expo-linear-gradient).
// The Figma leans heavily on gradients for hero surfaces — keep them here as
// named tokens so a GradientCard just takes a `gradient` name.
// Each value is the array of stop colors passed to <LinearGradient colors={...} />.

export const gradients = {
  brand: ['#7B68EE', '#9F8FFF'], // purple — Monthly Budget, month summary, profile
  health: ['#00C950', '#03A84A'], // green — Finance Health Score banner (approx; refine from screenshot)
} as const

export type GradientToken = keyof typeof gradients
