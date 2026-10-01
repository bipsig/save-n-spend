import { useEffect } from "react";
import { get } from "@/lib/api";
import type { TripsPayload } from "@save-n-spend/types";
import { create } from "zustand";

type TripName = { name: string; emoji: string };

interface TripNameState {
  byId: Record<string, TripName>;
  loaded: boolean;
  load: () => Promise<void>;
  reset: () => void;
}

// Every trip's name, for tagging rows elsewhere (Activity) that carry only a tripId. Loaded
// on first use rather than at sign-in — most sessions never show a trip row.
let inFlight: Promise<void> | null = null;

export const useTripNameStore = create<TripNameState>((set) => ({
  byId: {},
  loaded: false,

  load: () => {
    inFlight ??= get<TripsPayload>("/trips")
      .then(({ trips }) => set({ byId: Object.fromEntries(trips.map((t) => [t._id, { name: t.name, emoji: t.emoji }])), loaded: true }))
      .finally(() => { inFlight = null; });
    return inFlight;
  },

  reset: () => set({ byId: {}, loaded: false }),
}));

/** A trip's name and emoji by id, loading the list the first time one is asked for. */
export const useTripName = (id: string | null | undefined): TripName | null => {
  const trip = useTripNameStore((s) => (id ? s.byId[id] : undefined));
  const loaded = useTripNameStore((s) => s.loaded);
  useEffect(() => {
    if (id && !loaded) void useTripNameStore.getState().load().catch(() => {});
  }, [id, loaded]);
  return trip ?? null;
};
