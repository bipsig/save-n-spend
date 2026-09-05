import { useCallback, useEffect, useState } from "react";
import type { HealthBand, HealthPillarKey, HealthScore } from "@save-n-spend/types";
import type { ColorToken } from "@/theme";
import type { IconName } from "@/lib/icons";
import { get } from "./api";
import { useSession } from "@/store/session";

// The client half of the financial health score. The arithmetic is entirely
// server-side (see the API's services/healthService) — everything here is presentation:
// which colour a band wears, which icon a pillar gets, and how the number is fetched.
//
// Kept that way on purpose. The score is a judgement, and a judgement computed in two
// places is two judgements. The client's job is to not disagree with it.

/**
 * Band → colour. Green only at the top two bands: a card that glows green at 55/100 is
 * telling the user they are fine when the score is saying they are not, and the colour
 * is what people read first.
 */
export const BAND_COLOR: Record<HealthBand | "unknown", ColorToken> = {
  excellent: "success",
  good: "success",
  fair: "warning",
  attention: "warning",
  risk: "danger",
  unknown: "inkDim",
};

export const PILLAR_ICON: Record<HealthPillarKey, IconName> = {
  savings: "savings",
  buffer: "shield",
  bills: "bills",
  budgets: "insights",
  goals: "trophy",
};

/**
 * A pillar's own colour, from its own score — not from the total.
 *
 * This is the detail that makes the card honest: a 78 overall with one pillar at 20
 * should show one red row, not three green ones. Someone scanning the card should be
 * able to find the problem without reading a word.
 */
export const pillarColor = (score: number | null): ColorToken => {
  if (score === null) return "inkDim";
  if (score >= 80) return "success";
  if (score >= 60) return "ink";
  if (score >= 40) return "warning";
  return "danger";
};

export const useHealthScore = () => {
  const status = useSession((s) => s.status);
  const [data, setData] = useState<HealthScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (useSession.getState().status !== "authed") return;
    setError(null);

    try {
      setData(await get<HealthScore>("/dashboard/health"));
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authed") void refetch();
  }, [status, refetch]);

  return { data, loading, error, refetch };
};
