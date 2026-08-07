import type { IBill, BillFrequency } from "@save-n-spend/types";
import { useCallback, useEffect, useState } from "react";
import { get } from "@/lib/api";
import { useSession } from "@/store/session";

const isFuturePeriod = (dueDate: string, frequency?: BillFrequency): boolean => {
  const due = new Date(dueDate);
  const now = new Date();
  if (frequency === "yearly") return due.getUTCFullYear() > now.getUTCFullYear();
  return due.getUTCFullYear() * 12 + due.getUTCMonth() > now.getUTCFullYear() * 12 + now.getUTCMonth();
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
