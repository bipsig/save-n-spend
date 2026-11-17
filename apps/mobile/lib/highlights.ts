import { useCallback, useEffect, useState } from "react";
import type { HighlightScreen, HighlightSeverity, HighlightsPayload } from "@save-n-spend/types";
import type { ColorToken } from "@/theme";
import type { IconName } from "@/lib/icons";
import { useApiQuery } from "@/lib/query/useApiQuery";
import { readJson, writeJson } from "./deviceStore";

// The client half of Highlights. Like lib/health, everything judged is judged
// server-side — ranking, thresholds, copy — and everything here is presentation:
// a colour per severity, a route per screen, and which cards this phone has waved
// away. The client's job is to not disagree with the server.

/**
 * Severity → colour, mirroring Badge's palette so a card and a badge never argue.
 * Only `urgent` gets red: it is reserved for the one rule that predicts a payment
 * failing, and red everywhere is red nowhere.
 */
export const SEVERITY_COLOR: Record<HighlightSeverity, ColorToken> = {
  urgent: "danger",
  warning: "warning",
  notice: "info",
  win: "success",
};

export const SEVERITY_ICON: Record<HighlightSeverity, IconName> = {
  urgent: "budgetOver",
  warning: "budgetWarning",
  notice: "info",
  win: "budgetOk",
};

/** The chip label. One word — the title is where the actual news lives. */
export const SEVERITY_LABEL: Record<HighlightSeverity, string> = {
  urgent: "Act now",
  warning: "Watch",
  notice: "Note",
  win: "Win",
};

/**
 * screen → route. The server sends where a card should land semantically and this
 * map owns the paths, so a renamed route is a one-line change here rather than a
 * server deploy.
 */
export const SCREEN_ROUTE: Record<HighlightScreen, string> = {
  budgets: "/budget",
  bills: "/bills",
  goals: "/goals",
  health: "/health",
  activity: "/activity",
  investments: "/investments",
};

/** The human name for `screen`, spoken by accessibility labels ("Opens Budgets.") — kept
 *  alongside `SCREEN_ROUTE` so the two can never name a screen inconsistently. */
export const SCREEN_LABEL: Record<HighlightScreen, string> = {
  budgets: "Budgets",
  bills: "Bills",
  goals: "Goals",
  health: "Health",
  activity: "Activity",
  investments: "Investments",
};

// Dismissals.
// Device-local, like privacy mode and the app lock: which cards THIS phone has waved
// away is not an account fact, and keeping it off the server keeps the whole feature
// read-only there. A dismissal expires after a week — a card that still fires then
// has stayed true for a week, which is exactly when it has earned a second look.
// Month keys also roll the suppression naturally: a new month is a new key.

const DISMISSED_KEY = "sns.dismissedHighlights";
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

type DismissedMap = Record<string, number>; // highlight key → when it was waved away

const prune = (map: DismissedMap, now: number): DismissedMap =>
  Object.fromEntries(Object.entries(map).filter(([, at]) => now - at < DISMISS_FOR_MS));

export const useHighlights = () => {
  const { data, loading, refreshing, error, errorStatus, refetch, fetchedAt } = useApiQuery<HighlightsPayload>("/highlights");
  // Null until read. Read again with each new answer, so a card waved away on another
  // screen stays hidden here; until the first read no card shows, so a freshly opened
  // screen never flashes one dismissed yesterday.
  const [dismissed, setDismissed] = useState<DismissedMap | null>(null);
  useEffect(() => {
    let live = true;
    void readJson<DismissedMap>(DISMISSED_KEY).then((stored) => {
      if (live) setDismissed(prune(stored ?? {}, Date.now()));
    });
    return () => { live = false; };
  }, [fetchedAt]);

  const dismiss = useCallback((key: string) => {
    setDismissed((prev) => {
      // Pruned on every write, so the blob never accumulates a history of expired
      // keys from months of use.
      const nextMap = prune({ ...(prev ?? {}), [key]: Date.now() }, Date.now());
      void writeJson(DISMISSED_KEY, nextMap);
      return nextMap;
    });
  }, []);

  const highlights = dismissed ? (data?.highlights ?? []).filter((h) => !(h.key in dismissed)) : [];

  return {
    /** Server order preserved — it is already ranked by rupees at stake. */
    highlights,
    /** True when cards exist but every one has been waved away, so the empty state
     *  can say "dismissed" rather than pretending the month is spotless. */
    allDismissed: dismissed !== null && (data?.highlights.length ?? 0) > 0 && highlights.length === 0,
    warmingUp: data?.warmingUp ?? null,
    loading: loading || (data !== null && dismissed === null),
    refreshing,
    error,
    errorStatus,
    refetch,
    fetchedAt,
    dismiss,
  };
};
