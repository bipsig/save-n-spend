import type { TripDetailPayload, TripsPayload } from "@save-n-spend/types";
import { get, patch, post, put, type RequestOptions } from "@/lib/api";
import { useAccountStore } from "@/store/accounts";
import { useApiQuery } from "@/lib/query/useApiQuery";
import { useTripNameStore } from "@/store/tripNames";
import { appZone, calendarToday } from "@/lib/zone";

/** The Insights breakdown's slice for all trip spending — mirrors the API's TRIPS_SLICE_ID. */
export const TRIPS_SLICE_ID = "trips";

export const useTrips = () => useApiQuery<TripsPayload>("/trips");
export const useTrip = (id: string | undefined) => useApiQuery<TripDetailPayload>(id ? `/trips/${id}` : null);

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

/** Null when the reply had no record (see lib/replayed.ts). */
export const createTrip = async (draft: TripDraft, opts?: RequestOptions): Promise<{ _id: string } | null> => {
  const trip = await post<{ _id: string } | null>("/trips", draft, opts);
  void reloadTripNames();
  return trip ?? null;
};
export const updateTrip = async (id: string, draft: Partial<TripDraft>) => {
  await patch(`/trips/${id}`, draft);
  void reloadTripNames();
};
/** What a trip delete reloads beyond the screens' reads: balances and Activity's trip names. */
export const reloadAfterTripDelete = () => Promise.all([reloadAccounts(), reloadTripNames()]);

export const addTripExpense = async (tripId: string, draft: TripExpenseDraft, opts?: RequestOptions) => {
  await post(`/trips/${tripId}/expenses`, draft, opts);
  await reloadAccounts();
};
export const updateTripExpense = async (tripId: string, expenseId: string, draft: TripExpenseDraft, opts?: RequestOptions) => {
  await patch(`/trips/${tripId}/expenses/${expenseId}`, draft, opts);
  await reloadAccounts();
};
/** What a trip expense or plan delete reloads beyond the screens' reads. */
export const reloadAfterTripRowsDelete = reloadAccounts;

export const settleTrip = async (tripId: string, body: { person: string; account: string; amount: number; direction: "received" | "paid" }, opts?: RequestOptions) => {
  await post(`/trips/${tripId}/settle`, body, opts);
  await reloadAccounts();
};

/** `closedOn` is the day the trip counts on, as one expense in Trips. */
export const closeTrip = async (tripId: string, letGo: string[], closedOn: string, opts?: RequestOptions) => {
  await post(`/trips/${tripId}/close`, { letGo, closedOn }, opts);
  await reloadAccounts();
};
/** Moves a closed trip's one entry to another day; the trip stays closed. */
export const changeCloseDate = (tripId: string, closedOn: string) => patch(`/trips/${tripId}/close-date`, { closedOn });
export const reopenTrip = (tripId: string) => post(`/trips/${tripId}/reopen`);

/** Saves what each person pays you after Splitwise's "simplify debts" — signed paise, positive
 *  = they pay you. Anyone left out pays nothing. Replaces any earlier plan. */
export const savePlan = async (tripId: string, entries: { account: string; amount: number }[], opts?: RequestOptions) => {
  await put(`/trips/${tripId}/plan`, { entries }, opts);
  await reloadAccounts();
};

/** Back to the exact amounts. */

/** Evenly, to the paisa — the first few absorb the remainder so the shares always add up.
 *  Mirrors the API's splitEvenly. */
export const splitEvenly = (cost: number, count: number): number[] => {
  if (count <= 0) return [];
  const base = Math.floor(cost / count);
  const extra = cost - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
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

export const commitImport = async (tripId: string, csv: string, mapping: NameMapping, decisions: ImportDecision[], opts?: RequestOptions) => {
  const result = await post<{ added: number; applied: number; settled: number; matchSplitwise: boolean } | null>(`/trips/${tripId}/import/commit`, { csv, mapping, decisions }, opts);
  await reloadAccounts();
  // Null when the reply had no counts (see lib/replayed.ts): imported, but how many is unknown.
  return result ?? null;
};
