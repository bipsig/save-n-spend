// Is the API awake yet? Render's free tier suspends an idle instance and takes the better part
// of a minute to return, and the first request pays that cost — if that request is `/auth/me`,
// a cold start looks like "the app logged me out". So nothing else talks to the API until this
// says the lights are on.
//
// A store, not a hook, because two consumers must agree: the boot sequence in app/_layout and
// WakeGate. Only the URL is borrowed from `lib/api`, never its request path, so this cannot
// join an import cycle with the session store it exists to protect.
import { create } from 'zustand';
import { HEALTH_URL } from '@/lib/api';

/**
 * `probing`  — first attempt in flight, behind the splash. LAUNCH-ONLY: nothing paints during
 *              `probing`, so a second pass through it would be a black screen.
 * `waking`   — no answer yet, almost certainly a cold start. The only phase with a screen.
 * `awake`    — the server answered. The app renders.
 * `unreachable` — budget ran out. A very slow cold start and no signal look the same from here.
 */
export type WakePhase = 'probing' | 'waking' | 'awake' | 'unreachable';

/** How long the FIRST attempt gets before we conclude the server is asleep. Short: a warm
 *  server answers well under a second, and overshooting only costs a screen that flashes. */
const FIRST_ATTEMPT_MS = 2_500;

/** Per-attempt ceiling once we know we are waiting for a boot. Generous: a slow answer is
 *  still an answer. */
const RETRY_ATTEMPT_MS = 8_000;

/** Total time the gate may hold the app. Render documents ~50s worst case; past a minute,
 *  whatever is wrong is not a cold start. */
const BUDGET_MS = 60_000;

/** Not zero — a tight loop adds load to the thing we are waiting for. */
const GAP_MS = 1_200;

interface WakeState {
    phase: WakePhase;
    /** 1-based, for the "still waking… (3)" line. Only meaningful while `waking`. */
    attempt: number;
    /** Safe to call any number of times: the first call owns the work and later ones await the
     *  same promise, so the boot sequence and the gate cannot race. */
    probe: () => Promise<void>;
    /** Start over after `unreachable`. */
    retry: () => Promise<void>;
    /** Give up waiting and render the app anyway. The escape hatch — see WakeGate. */
    proceedAnyway: () => void;
}

/** One `GET /health`, with a hard timeout. ANY status counts — the question is "is a process
 *  listening", not "is it healthy". Exported for the boot flow's own quick reachability
 *  check on a cached-session launch, which skips this store's full waking sequence. */
export const ping = async (timeoutMs: number): Promise<boolean> => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);

    try {
        await fetch(HEALTH_URL, { method: 'GET', signal: abort.signal });
        return true;
    }
    catch {
        return false; // timed out, DNS failure, no route — the same answer here
    }
    finally {
        clearTimeout(timer);
    }
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Module-level: machinery, not state anything renders.
let inFlight: Promise<void> | null = null;

export const useWake = create<WakeState>((set, get) => {
    const run = async (): Promise<void> => {
        const startedAt = Date.now();

        if (await ping(FIRST_ATTEMPT_MS)) {
            set({ phase: 'awake' });
            return;
        }

        // `proceedAnyway` (or an offline-authed boot on cached data) while this first
        // ping was in flight — stop, and do not drag the screen the user is already
        // looking at back into the waking screen.
        if (get().phase !== 'probing' && get().phase !== 'waking') return;

        // Only now does the user learn any of this is happening.
        set({ phase: 'waking', attempt: 1 });

        while (Date.now() - startedAt < BUDGET_MS) {
            await sleep(GAP_MS);

            // `proceedAnyway` while we were waiting — stop, and do not overwrite it.
            if (get().phase !== 'waking') return;

            set({ attempt: get().attempt + 1 });

            if (await ping(RETRY_ATTEMPT_MS)) {
                set({ phase: 'awake' });
                return;
            }
        }

        set({ phase: 'unreachable' });
    };

    const start = (): Promise<void> => {
        if (!inFlight) {
            inFlight = run().finally(() => {
                inFlight = null;
            });
        }
        return inFlight;
    };

    return {
        phase: 'probing',
        attempt: 0,

        probe: () => {
            // A once-per-launch cost: the instance stays up while in use, so re-probing later
            // spends a request to learn what we already know.
            if (get().phase === 'awake') return Promise.resolve();
            return start();
        },

        // Straight to `waking`, never back to `probing` — which paints nothing, and would
        // blank a screen the user is already looking at.
        retry: () => {
            set({ phase: 'waking', attempt: 0 });
            return start();
        },

        proceedAnyway: () => set({ phase: 'awake' }),
    };
});
