// Gradient definitions for LinearGradient (expo-linear-gradient).
// Vivid on the dark ground — these are the "colored glass" hero surfaces.
// Each value is the array of stop colors passed to <LinearGradient colors={...} />.

export const gradients = {
  brand: ['#8B7BFF', '#6D5CF6'],  // violet — Monthly Budget, month summary, profile
  health: ['#2FE08A', '#12B981'], // green — Finance Health Score banner
} as const

export type GradientToken = keyof typeof gradients
