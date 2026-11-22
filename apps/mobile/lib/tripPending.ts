// A trip page while one of its deletes waits out the undo window: the expense leaves the
// journal at once, and "Back to exact amounts" shows the exact balances at once. Totals and
// the other figures stay as the server last sent them until the delete is sent.
import { useMemo } from "react";
import type { TripDetailPayload } from "@save-n-spend/types";
import { usePendingDeletes } from "@/store/pendingDeletes";

export const tripWhilePending = (data: TripDetailPayload, keys: ReadonlySet<string>): TripDetailPayload => {
  const gone = (expenseId: string) => keys.has(`tripExpense:${expenseId}`);
  const planGone = keys.has(`plan:${data.trip._id}`);
  if (!planGone && !data.expenses.some((e) => gone(e._id))) return data;
  return {
    ...data,
    expenses: data.expenses.filter((e) => !gone(e._id)),
    entries: data.entries.filter((e) => e.kind !== "expense" || !gone(e.id)),
    ...(planGone ? { plan: null, members: data.members.map((m) => ({ ...m, balance: m.exact, routed: 0 })) } : {}),
  };
};

export const useTripWhilePending = (data: TripDetailPayload | null | undefined): TripDetailPayload | null | undefined => {
  const keys = usePendingDeletes((s) => s.keys);
  return useMemo(() => (data ? tripWhilePending(data, keys) : data), [data, keys]);
};
