// The only surviving mock: the dashboard health score. It has no API yet
// (deliberate gap — the real score lands with the insights milestone), so the
// HealthScoreCard reads these fixed values until then.
export type HealthSummary = {
  healthScore: number;
  rating: string;
};

export const dashboard: HealthSummary = {
  healthScore: 85,
  rating: "Excellent",
};
