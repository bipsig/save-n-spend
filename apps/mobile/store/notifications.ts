import { create } from "zustand";
import type { INotification, NotificationFeed } from "@save-n-spend/types";
import { get, patch, post } from "@/lib/api";

// The bell's state, held globally rather than by the notifications screen: the unread
// count is drawn in the header of a screen the list isn't mounted on, and a push
// arriving while the app is open has to be able to bump both at once.

interface NotificationState {
  items: INotification[];
  unread: number;
  page: number;
  hasNextPage: boolean;
  /** First page only — `loadingMore` keeps the list from flashing into a skeleton. */
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  load: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  reset: () => void;
}

const PAGE_SIZE = 20;

export const useNotifications = create<NotificationState>((set, getState) => ({
  items: [],
  unread: 0,
  page: 1,
  hasNextPage: false,
  loading: false,
  loadingMore: false,
  error: null,

  load: async () => {
    // No skeleton on a refresh that already has rows — the list is re-read on every
    // focus and on every push, and flashing it empty each time would be worse than a
    // moment of slightly stale copy.
    set({ loading: getState().items.length === 0, error: null });
    try {
      const feed = await get<NotificationFeed>(`/notifications?page=1&limit=${PAGE_SIZE}`);
      set({
        items: feed.items,
        unread: feed.unread,
        page: feed.page,
        hasNextPage: feed.hasNextPage,
        loading: false,
      });
    }
    catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Couldn't load notifications",
      });
    }
  },

  loadMore: async () => {
    const { hasNextPage, loadingMore, page } = getState();
    if (!hasNextPage || loadingMore) return;

    set({ loadingMore: true });
    try {
      const feed = await get<NotificationFeed>(`/notifications?page=${page + 1}&limit=${PAGE_SIZE}`);
      set((state) => ({
        // Appended by id rather than blindly concatenated: a notification arriving
        // between the two requests shifts every row down one, and the last row of the
        // previous page would otherwise appear twice.
        items: [
          ...state.items,
          ...feed.items.filter((item) => !state.items.some((seen) => seen._id === item._id)),
        ],
        unread: feed.unread,
        page: feed.page,
        hasNextPage: feed.hasNextPage,
        loadingMore: false,
      }));
    }
    catch {
      // Silent: the rows already on screen are still valid, and a failed "load more"
      // has nothing to say that a second scroll won't retry.
      set({ loadingMore: false });
    }
  },

  markRead: async (id) => {
    const target = getState().items.find((item) => item._id === id);
    if (!target || target.readAt) return;

    // Optimistic: the dot has to go out under the finger, because the tap that marks it
    // read is usually the same tap that navigates away from the list.
    const readAt = new Date().toISOString();
    set((state) => ({
      items: state.items.map((item) => (item._id === id ? { ...item, readAt } : item)),
      unread: Math.max(0, state.unread - 1),
    }));

    try {
      const result = await patch<{ notification: INotification; unread: number }>(`/notifications/${id}/read`);
      // The server's count wins — it knows about notifications this page never held.
      set({ unread: result.unread });
    }
    catch {
      // Put the dot back rather than leave the list claiming something it failed to do.
      set((state) => ({
        items: state.items.map((item) => (item._id === id ? { ...item, readAt: null } : item)),
        unread: state.unread + 1,
      }));
    }
  },

  markAllRead: async () => {
    const before = getState().items;
    const unreadBefore = getState().unread;
    if (unreadBefore === 0) return;

    const readAt = new Date().toISOString();
    set((state) => ({
      items: state.items.map((item) => (item.readAt ? item : { ...item, readAt })),
      unread: 0,
    }));

    try {
      await post<{ unread: number }>("/notifications/read-all");
    }
    catch {
      set({ items: before, unread: unreadBefore });
    }
  },

  // On sign-out. One user's notifications must never be on screen under another's
  // session — the next user's first load fills this again.
  reset: () => set({
    items: [],
    unread: 0,
    page: 1,
    hasNextPage: false,
    loading: false,
    loadingMore: false,
    error: null,
  }),
}));
