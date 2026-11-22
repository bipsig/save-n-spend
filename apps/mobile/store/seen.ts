// Home's "seen" values for the signed-in account (gaps row 185): whether Get started was
// waved away, the highest net-worth milestone already celebrated, and the last closed week and
// month the review banner showed. Kept per account on this phone (lib/perUser) and marked
// seen the moment a card is SHOWN, not only when tapped.
import { create } from "zustand";
import { readJson, writeJson } from "@/lib/deviceStore";
import { perUser, SEEN_KEYS } from "@/lib/perUser";

export type HomeSeen = {
  getStartedDismissed: boolean;
  /** Paise. */
  netWorthMilestoneSeen: number;
  lastReviewedPeriod: { week: string | null; month: string | null };
};

const DEFAULTS: HomeSeen = { getStartedDismissed: false, netWorthMilestoneSeen: 0, lastReviewedPeriod: { week: null, month: null } };

const home = perUser<HomeSeen>(SEEN_KEYS.home);

/** Where 2.8.7 and older kept these, for the whole phone (store/settings). */
const LEGACY_DEVICE_KEY = "sns.deviceSettings";
type LegacyDevice = { getStartedDismissed?: string[]; netWorthMilestoneSeen?: number; lastReviewedPeriod?: HomeSeen["lastReviewedPeriod"] } & Record<string, unknown>;

/** The account's own values, or the ones the phone kept before 2.8.8: Get started from its
 *  per-account list, the other two adopted by this account and dropped from the phone's. */
export const loadHomeSeen = async (userId: string): Promise<HomeSeen> => {
  const own = await home.read(userId);
  if (own) return { ...DEFAULTS, ...own };
  const legacy = await readJson<LegacyDevice>(LEGACY_DEVICE_KEY);
  const seen: HomeSeen = {
    getStartedDismissed: !!legacy?.getStartedDismissed?.includes(userId),
    netWorthMilestoneSeen: legacy?.netWorthMilestoneSeen ?? 0,
    lastReviewedPeriod: legacy?.lastReviewedPeriod ?? DEFAULTS.lastReviewedPeriod,
  };
  await home.write(userId, seen);
  if (legacy && ("netWorthMilestoneSeen" in legacy || "lastReviewedPeriod" in legacy)) {
    const { netWorthMilestoneSeen: _m, lastReviewedPeriod: _r, ...rest } = legacy;
    await writeJson(LEGACY_DEVICE_KEY, rest);
  }
  return seen;
};

type SeenState = HomeSeen & {
  userId: string | null;
  hydrate: (userId: string) => Promise<void>;
  update: (patch: Partial<HomeSeen>) => void;
  reset: () => void;
};

export const useSeen = create<SeenState>((set, get) => ({
  ...DEFAULTS,
  userId: null,

  hydrate: async (userId) => {
    const seen = await loadHomeSeen(userId);
    set({ ...seen, userId });
  },

  // Optimistic, like settings: the card goes under the finger, the write follows.
  update: (patch) => {
    const { userId } = get();
    set(patch);
    if (!userId) return;
    const { getStartedDismissed, netWorthMilestoneSeen, lastReviewedPeriod } = get();
    void home.write(userId, { getStartedDismissed, netWorthMilestoneSeen, lastReviewedPeriod });
  },

  reset: () => set({ ...DEFAULTS, userId: null }),
}));
