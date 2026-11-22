// When this account last opened the app on this phone: "since you last opened" is about this
// phone's own visits, not an account fact. Per account (lib/perUser, gaps row 185), so two
// people sharing one phone don't inherit each other's.
import { create } from "zustand";
import { readJson, writeJson } from "@/lib/deviceStore";
import { perUser, SEEN_KEYS } from "@/lib/perUser";

const lastOpened = perUser<string>(SEEN_KEYS.lastOpened);

/** Where 2.8.7 and older kept it: one map for the phone, user id → ISO timestamp. */
const LEGACY_KEY = "sns.lastOpenedAt";

const readOwn = async (userId: string): Promise<string | null> => {
  const own = await lastOpened.read(userId);
  if (own) return own;
  const map = await readJson<Record<string, string>>(LEGACY_KEY);
  if (!map?.[userId]) return null;
  const { [userId]: legacy, ...others } = map;
  await writeJson(LEGACY_KEY, others);
  return legacy;
};

interface LastOpenedState {
  /** The PREVIOUS session's open time for this user — read once at hydrate and held for
   *  the whole session, so a digest built from it keeps meaning "before now" even though
   *  this session's own start time is written back to storage immediately after. Null on
   *  a first-ever launch, when there is nothing yet to compare against. */
  previousOpenedAt: string | null;
  hydrated: boolean;
  hydrate: (userId: string) => Promise<void>;
}

export const useLastOpened = create<LastOpenedState>((set) => ({
  previousOpenedAt: null,
  hydrated: false,

  hydrate: async (userId) => {
    const previous = await readOwn(userId);
    set({ previousOpenedAt: previous, hydrated: true });
    void lastOpened.write(userId, new Date().toISOString());
  },
}));
