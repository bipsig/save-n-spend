import type { ITransaction } from "@save-n-spend/types";
import { useCallback, useEffect, useState } from "react";
import { get } from "@/lib/api";

interface Paginated<T> {
  docs: T[]
};

export const useTransactions = () => {
  const [items, setItems] = useState<ITransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  
  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await get<Paginated<ITransaction>>("/transactions");
      setItems(res.docs);
    } 
    catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
    finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    refetch();
  }, [refetch]);
  
  return { items, loading, error, refetch };
}

