// Stores loaded once on reaching `authed` (app/_layout) stay empty when that load found no
// connection and no cached copy, as on an offline first launch after the cache clear. This
// loads them again when the connection comes back. Pure, so it's tested under node
// (lib/reconnectReload.test.ts).

type Loadable = { getState: () => { loaded: boolean; load: () => Promise<void> } };
type Watched = { subscribe: (listener: (state: { offline: boolean }, prev: { offline: boolean }) => void) => () => void };

/** Returns the unsubscribe. Only the offline-to-online change triggers, so a load that fails
 *  while online is not retried in a loop; it waits for the next reconnect. */
export const reloadOnReconnect = (connectivity: Watched, isAuthed: () => boolean, stores: Loadable[]): (() => void) => {
  const running = new Set<Loadable>();
  return connectivity.subscribe((state, prev) => {
    if (!prev.offline || state.offline || !isAuthed()) return;
    for (const store of stores) {
      if (store.getState().loaded || running.has(store)) continue;
      running.add(store);
      store.getState().load().catch(() => {}).finally(() => running.delete(store));
    }
  });
};
