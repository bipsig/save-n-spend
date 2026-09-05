// Is the API awake yet?
//
// The server runs on Render's free tier, which suspends an instance after a stretch of
// no traffic and takes the better part of a minute to bring it back. The first request
// after that pays the whole cost, and until this store existed that request was
// `/auth/me` — so a cold start looked like "the app logged me out", which is the worst
// possible reading of "the server was asleep".
//
// So nothing else talks to the API until this says the lights are on.
//
// A store rather than a hook because it has two consumers that must agree: the boot
// sequence in app/_layout, which has to hold `/auth/me` until the probe clears, and
// WakeGate, which paints the waiting screen. Kept free of any import from `lib/api`'s
// request path — only the URL is borrowed — so it cannot join an import cycle with the
// session store it exists to protect.
import { create } from 'zustand';
import { HEALTH_URL } from '@/lib/api';

/**
 * `probing`  — first attempt in flight. Nothing is shown; the splash still covers this.
 *              Launch-only, and that is a rule the gate depends on: nothing paints during
 *              `probing`, so any later re-probe goes straight to `waking` instead. A
 *              second pass through this phase would be a black screen.
 * `waking`   — the first attempt did not answer, so we are almost certainly watching a
 *              cold start. This is the only phase with a screen of its own.
 * `awake`    — the server answered. The app renders.
 * `unreachable` — the budget ran out. Could be a cold start that is taking unusually
 *              long, could be no signal; from here they are indistinguishable, so the
 *              screen says so and offers the two things that help.
 */
export type WakePhase = 'probing' | 'waking' | 'awake' | 'unreachable';

/** How long the FIRST attempt is given before we conclude the server is asleep.
 *
 *  Short on purpose. A warm server answers this in well under a second, and every
 *  millisecond over that is a spinner in front of someone who did not need one. If a
 *  healthy-but-slow network overshoots it the cost is a waking screen that appears and
 *  then vanishes — annoying, and much cheaper than the reverse. */
const FIRST_ATTEMPT_MS = 2_500;

/** Per-attempt ceiling once we know we are waiting for a boot. Generous, because at this
 *  point a slow answer is still an answer and giving up early just wastes the wait. */
const RETRY_ATTEMPT_MS = 8_000;

/** Total time the gate is allowed to hold the app. Render's free tier is documented at
 *  roughly 50 seconds worst case; past a minute, whatever is wrong is not a cold start. */
const BUDGET_MS = 60_000;

/** Breather between attempts. Not zero — a tight loop against a booting server adds
 *  load to the thing we are waiting for. */
const GAP_MS = 1_200;

interface WakeState {
    phase: WakePhase;
    /** 1-based, for the "still waking… (3)" line. Only meaningful while `waking`. */
    attempt: number;
    /**
     * Runs the probe. Safe to call from anywhere, any number of times: the first call
     * owns the work and every later one awaits the same promise, so the boot sequence
     * and the gate cannot start two races against each other.
     */
    probe: () => Promise<void>;
    /** Start over after `unreachable`. */
    retry: () => Promise<void>;
    /** Give up waiting and render the app anyway. The escape hatch — see WakeGate. */
    proceedAnyway: () => void;
}

/** One `GET /health`, with a hard timeout. `ok` only if the server actually answered.
 *
 *  Any status is good enough. We are asking "is a process listening", not "is it
 *  healthy" — a 500 from the API still means the instance is up, and the screens behind
 *  the gate have their own error states for everything else. */
const ping = async (timeoutMs: number): Promise<boolean> => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);

    try {
        await fetch(HEALTH_URL, { method: 'GET', signal: abort.signal });
        return true;
    }
    catch {
        return false; // timed out, DNS failure, no route — all the same answer here
    }
    finally {
        clearTimeout(timer);
    }
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// The in-flight run, so `probe()` is idempotent. Module-level rather than in the store
// because it is machinery, not state anything renders.
let inFlight: Promise<void> | null = null;

export const useWake = create<WakeState>((set, get) => {
    const run = async (): Promise<void> => {
        const startedAt = Date.now();

        if (await ping(FIRST_ATTEMPT_MS)) {
            set({ phase: 'awake' });
            return;
        }

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
            // Already settled: nothing to wait for. Notably this makes the gate a
            // once-per-launch cost — the instance stays up for as long as it is being
            // used, so re-probing later would spend a request to learn what we know.
            if (get().phase === 'awake') return Promise.resolve();
            return start();
        },

        // Straight to `waking`, never back to `probing`. By this point we already know
        // the server was unresponsive, so there is no "maybe it is warm" case worth
        // optimising for — and `probing` paints nothing, which would blank a screen the
        // user is already looking at.
        retry: () => {
            set({ phase: 'waking', attempt: 0 });
            return start();
        },

        proceedAnyway: () => set({ phase: 'awake' }),
    };
});
