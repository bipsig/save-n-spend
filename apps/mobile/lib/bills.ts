import type { IBill, BillFrequency } from "@save-n-spend/types";
import { useCallback, useEffect, useState } from "react";
import { del, get, patch } from "@/lib/api";
import { appZone, calendarDate, calendarToday } from "@/lib/zone";
import { useSession } from "@/store/session";

// Mirrors the server's own period comparison exactly, in the same zone (see the
// API's billController). It has to: this is what decides whether the row offers a
// "Mark paid" button, and the server is what decides whether pressing it is allowed.
// The two disagreeing means a button that errors when tapped.
const isFuturePeriod = (dueDate: string, frequency?: BillFrequency): boolean => {
  const zone = appZone();
  const due = calendarDate(new Date(dueDate), zone);
  const today = calendarToday(zone);

  if (frequency === "yearly") return due.getUTCFullYear() > today.getUTCFullYear();
  return due.getUTCFullYear() * 12 + due.getUTCMonth() > today.getUTCFullYear() * 12 + today.getUTCMonth();
};

// A recurring bill can be paid or skipped only when its due date is in the
// current period or overdue — never once it has been pushed into a future
// period (which is exactly what paying or skipping does).
export const isActionable = (bill: IBill): boolean => {
  if (bill.status === "paid") return false;
  if (bill.recurring && isFuturePeriod(bill.dueDate, bill.frequency)) return false;
  return true;
};

export const useBills = () => {
  const status = useSession((s) => s.status);
  const [items, setItems] = useState<IBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (useSession.getState().status !== "authed") return;
    setLoading(true);
    setError(null);
    try {
      const data = await get<IBill[]>("/bills");
      setItems(data);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bills");
    }
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authed") refetch();
  }, [status, refetch]);

  return { items, loading, error, refetch };
};

/** The fields a bill's own sheet can change. `frequency` is absent for a one-off. */
export type BillPatch = {
  name: string;
  amount: number;
  category: string;
  dueDate: string;
  recurring: boolean;
  frequency?: BillFrequency;
  /** 0 = no advance nudge. The due-day and overdue notices aren't a lead time. */
  reminderDays: number;
};

export const updateBill = (id: string, body: BillPatch) => patch<IBill>(`/bills/${id}`, body);

// Unlike a category or an account, a bill really is erased: nothing is filed under it,
// and paying one writes a transaction that stands on its own.
export const deleteBill = (id: string) => del<null>(`/bills/${id}`);

export type BillGroups = {
  overdue: IBill[];
  upcoming: IBill[];
  paid: IBill[];
};

export const groupBills = (items: IBill[]): BillGroups => ({
  overdue: items.filter((b) => b.status === "overdue"),
  upcoming: items.filter((b) => b.status === "pending"),
  paid: items.filter((b) => b.status === "paid"),
});

export const outstandingTotal = (items: IBill[]) => {
  const outstanding = items.filter((b) => b.status === "overdue" || b.status === "pending");
  const total = outstanding.reduce((sum, b) => sum + b.amount, 0);
  const pending = items.filter((b) => b.status === "pending").length;
  const overdue = items.filter((b) => b.status === "overdue").length;
  return { total, pending, overdue };
};
