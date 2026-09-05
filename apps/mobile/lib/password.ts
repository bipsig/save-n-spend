import type { ColorToken } from "@/theme";

// Client-only heuristic: length + character variety → a 0–4 score. Zod still
// gates at ≥ 8; the meter just encourages going beyond the gate.
export const strengthOf = (pw: string): number => {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
};

// Indexed by score. `tip` nudges toward the next improvement.
export const STRENGTH: { tip: string; color: ColorToken }[] = [
  { tip: "Use at least 8 characters", color: "danger" },
  { tip: "Weak — add upper & lower case", color: "danger" },
  { tip: "Fair — add a number", color: "warning" },
  { tip: "Good — add a symbol to make it strong", color: "warning" },
  { tip: "Strong password", color: "success" },
];
