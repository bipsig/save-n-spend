// One way every paged list ends (gaps row 151): the next page loads as you near the bottom, a
// small spinner while it comes, a retry line if it failed, and "That's everything" once there is
// nothing left. Pure, so it's tested under node (listEnd.test.ts); ListEnd.tsx draws it.

export type ListEndState = "loading" | "failed" | "end" | null;

export const END_COPY = {
  end: "That's everything",
  failed: "Couldn't load more",
  retry: "Try again",
} as const;

/**
 * What the list's footer shows. "end" only after a second page: a list that fits on one page
 * ends plainly, and the line would only state the obvious under three rows.
 */
export const listEndState = (o: { hasMore: boolean; loadingMore: boolean; pagesLoaded: number; failed?: boolean }): ListEndState => {
  if (o.loadingMore) return "loading";
  if (o.failed && o.pagesLoaded > 0) return "failed";
  if (!o.hasMore && o.pagesLoaded > 1) return "end";
  return null;
};

type ScrollFrame = {
  layoutMeasurement: { height: number };
  contentOffset: { y: number };
  contentSize: { height: number };
};

/** Within one screen of the bottom: early enough that the next page is usually in before the
 *  last row shows, as FlatList's own `onEndReachedThreshold` does on Activity. */
export const nearEnd = ({ layoutMeasurement, contentOffset, contentSize }: ScrollFrame, screens = 1): boolean =>
  contentOffset.y + layoutMeasurement.height >= contentSize.height - layoutMeasurement.height * screens;
