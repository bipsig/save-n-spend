// Validated CVD chart palette (spec §03) — for chart MARKS only, assigned by
// rank; the tail folds into a neutral grey "Others". Values/labels stay in ink.
export const chartPalette = ['#0FA873', '#8E7DE3', '#C98500', '#3572D9', '#E65A64'] as const

export const chartOthers = '#767489'

// The built-in Trips category: one fixed teal on every screen, outside the ranked palette.
export const tripsColor = '#14B8A6'

// Income / expense series colours (spec legend).
export const incomeColor = '#0FA873'
export const expenseColor = '#E65A64'

// Investment value line, and the dashed scrub line under a finger.
export const chartValueColor = '#B0A2FF'
export const chartScrubLine = 'rgba(245,244,252,0.25)'

// One tooltip for every chart. 164 wide so exact paise fit ("Value ₹4,57,000.00").
export const chartTooltip = {
  width: 164,
  radius: 12,
  plate: '#241E42',
  border: 'rgba(255,255,255,0.14)',
  paddingH: 10,
  paddingV: 6,
  dot: 8,
} as const

// One legend: a 9 pt mark for areas and bars, a 14×3 line for lines and steps.
export const chartLegend = {
  mark: 9,
  markRadius: 3,
  lineW: 14,
  lineH: 3,
  labelGap: 6,
  itemGap: 16,
} as const
