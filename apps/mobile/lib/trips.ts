import { useCallback, useEffect, useState } from "react";
import type { TripDetailPayload, TripsPayload } from "@save-n-spend/types";
import { del, get, patch, post } from "@/lib/api";
import { useAccountStore } from "@/store/accounts";
import { useSession } from "@/store/session";
import { useTripNameStore } from "@/store/tripNames";
import { appZone, calendarToday } from "@/lib/zone";

/** The Insights breakdown's slice for all trip spending — mirrors the API's TRIPS_SLICE_ID. */
export const TRIPS_SLICE_ID = "trips";

const useFetch = <T,>(path: string | null) => {
  const status = useSession((s) => s.status);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!path || useSession.getState().status !== "authed") return;
    setError(null);
    try {
      setData(await get<T>(path));
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (status === "authed") void refetch();
  }, [status, refetch]);

  return { data, loading, error, refetch };
};

export const useTrips = () => useFetch<TripsPayload>("/trips");
export const useTrip = (id: string | undefined) => useFetch<TripDetailPayload>(id ? `/trips/${id}` : null);

export type TripDraft = {
  name: string;
  emoji: string;
  color: string;
  /** ISO. */
  startDate: string;
  endDate: string;
  members: string[];
  /** Paise, or null. */
  budget: number | null;
};

export type TripExpenseDraft = {
  title: string;
  occurredAt: string;
  category: string | null;
  cost: number;
  /** null = you paid. */
  paidBy: string | null;
  paidFrom: string | null;
  shares: { account: string | null; amount: number }[];
};

// Every write that moves money reloads the account store — balances on the other screens
// (Net Worth, the account picker) are otherwise stale until the next reload.
const reloadAccounts = () => useAccountStore.getState().load().catch(() => {});

// The names Activity tags rows with.
const reloadTripNames = () => useTripNameStore.getState().load().catch(() => {});

export const createTrip = async (draft: TripDraft) => {
  const trip = await post<{ _id: string }>("/trips", draft);
  void reloadTripNames();
  return trip;
};
export const updateTrip = async (id: string, draft: Partial<TripDraft>) => {
  await patch(`/trips/${id}`, draft);
  void reloadTripNames();
};
export const deleteTrip = async (id: string) => {
  await del(`/trips/${id}`);
  await reloadAccounts();
  void reloadTripNames();
};

export const addTripExpense = async (tripId: string, draft: TripExpenseDraft) => {
  await post(`/trips/${tripId}/expenses`, draft);
  await reloadAccounts();
};
export const updateTripExpense = async (tripId: string, expenseId: string, draft: TripExpenseDraft) => {
  await patch(`/trips/${tripId}/expenses/${expenseId}`, draft);
  await reloadAccounts();
};
export const deleteTripExpense = async (tripId: string, expenseId: string) => {
  await del(`/trips/${tripId}/expenses/${expenseId}`);
  await reloadAccounts();
};

export const settleTrip = async (tripId: string, body: { person: string; account: string; amount: number; direction: "received" | "paid" }) => {
  await post(`/trips/${tripId}/settle`, body);
  await reloadAccounts();
};

export const closeTrip = async (tripId: string, letGo: string[]) => {
  await post(`/trips/${tripId}/close`, { letGo });
  await reloadAccounts();
};
export const reopenTrip = (tripId: string) => post(`/trips/${tripId}/reopen`);

/** Evenly, to the paisa — the first few absorb the remainder so the shares always add up.
 *  Mirrors the API's splitEvenly. */
export const splitEvenly = (cost: number, count: number): number[] => {
  if (count <= 0) return [];
  const base = Math.floor(cost / count);
  const extra = cost - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
};

/** "7 Dec – 5 Jan" (with the year when it isn't this one). Calendar dates, read in UTC. */
export const tripDates = (startIso: string, endIso: string): string => {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const thisYear = new Date().getUTCFullYear();
  const fmt = (d: Date, withYear: boolean) =>
    d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const showYear = end.getUTCFullYear() !== thisYear;
  return `${fmt(start, !sameYear && showYear)} – ${fmt(end, showYear)}`;
};

/** Whole days, inclusive: a 7–9 Dec trip is 3 days. */
export const tripDays = (startIso: string, endIso: string): number =>
  Math.max(1, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 86_400_000) + 1);

/** Which day of the trip today is, where the user is, or null outside it. */
export const tripDayNumber = (startIso: string, endIso: string, today = calendarToday(appZone())): number | null => {
  const t = today.getTime();
  const start = new Date(startIso).getTime();
  if (t < start || t > new Date(endIso).getTime()) return null;
  return Math.round((t - start) / 86_400_000) + 1;
};

// A trip's dates are calendar days, stored as UTC midnight — so "1 Oct" is 1 Oct wherever it
// is read. The date picker works in device-local dates, so these two cross between them.

/** A trip date into the picker's local date. */
export const tripDayToPicker = (iso: string): Date => {
  const d = new Date(iso);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/** A picked local date into a trip date. */
export const pickerToTripDay = (picked: Date): string =>
  new Date(Date.UTC(picked.getFullYear(), picked.getMonth(), picked.getDate())).toISOString();

/** The card band colours, keyed by the trip's `color`. */
export const TRIP_GRADIENTS: Record<string, [string, string]> = {
  teal: ["#14b8a6", "#6d5cf6"],
  sunset: ["#f59e0b", "#e24a55"],
  ocean: ["#3b82f6", "#7b68ee"],
  forest: ["#10b981", "#3b82f6"],
  rose: ["#ec4899", "#8b5cf6"],
  sand: ["#eab308", "#f97316"],
};

export const TRIP_EMOJIS = ["🧳", "🏖", "🌴", "🏔", "🏙", "🏞", "✈️", "🚗", "⛺", "🎉", "🛕", "🌊"];

// ---- Splitwise import ----------------------------------------------------------------------

/** A name in the file → "me", a person account id, or "new". */
export type NameMapping = Record<string, string>;

export type ImportStatus = "ready" | "matchesYours" | "pickAccount" | "lump" | "settlement" | "isThisYours" | "alreadyIn" | "skipped";

export type ImportRow = {
  key: string;
  line: number;
  date: string;
  title: string;
  splitwiseCategory: string;
  cost: number;
  status: ImportStatus;
  myShare: number;
  payer: string | null;
  suggestedCategory: string | null;
  matches?: { id: string; title: string; cost: number }[];
  direction?: "received" | "paid";
  counterparty?: string | null;
  reason?: string;
};

export type ImportPreview =
  | { needsMapping: true; people: string[]; suggested: NameMapping }
  | { needsMapping: false; rows: ImportRow[]; myShare: number; balance: number; fileBalance: number | null; matchesFile: boolean };

export type ImportDecision = {
  key: string;
  action: "import" | "skip" | "apply";
  category?: string | null;
  account?: string | null;
  parts?: { title: string; category: string | null; cost: number }[];
};

export const previewImport = (tripId: string, csv: string, mapping?: NameMapping) =>
  post<ImportPreview>(`/trips/${tripId}/import/preview`, { csv, ...(mapping ? { mapping } : {}) });

export const commitImport = async (tripId: string, csv: string, mapping: NameMapping, decisions: ImportDecision[]) => {
  const result = await post<{ added: number; applied: number; settled: number }>(`/trips/${tripId}/import/commit`, { csv, mapping, decisions });
  await reloadAccounts();
  return result;
};
