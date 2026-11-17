import { View } from "react-native";
import ErrorState from "./ErrorState";
import NotFoundState from "./NotFoundState";
import SkeletonState from "./SkeletonState";
import { errorMessage, screenView, type ScreenState } from "@/lib/screenStates";
import { radius, spacing } from "@/theme";

type Props = {
  state: Pick<ScreenState, "hasData" | "error" | "refetch" | "notFound">;
  /** Drawn before the first answer. Defaults to four 72 pt rows. */
  skeleton?: React.ReactNode;
  /** For the not-found copy: "trip" gives "This trip isn't here any more". */
  thing?: string;
  /** A function when the content reads data that only exists once loaded. */
  children: React.ReactNode | (() => React.ReactNode);
};

export const ListSkeleton = ({ rows = 4, height = 72 }: { rows?: number; height?: number }) => (
  <View style={{ gap: spacing.md }}>
    {Array.from({ length: rows }).map((_, i) => (
      <SkeletonState key={i} height={height} borderRadius={radius.lg} />
    ))}
  </View>
);

/**
 * The body of a data screen: the skeleton before the first answer, the full error only when
 * there is nothing to show, otherwise the content, kept through a failed refresh (the strip
 * under the header says so; pass the same state to ScreenScaffold's `states`).
 *
 * Sheets go beside this, never inside it, so a state change can't unmount an open sheet.
 */
const ScreenStates = ({ state, skeleton, thing = "item", children }: Props) => {
  switch (screenView(state)) {
    case "notFound":
      return <NotFoundState thing={thing} />;
    case "error":
      return <ErrorState message={errorMessage(state.error)} onRetry={() => void state.refetch()} />;
    case "skeleton":
      return <>{skeleton ?? <ListSkeleton />}</>;
    default:
      return <>{typeof children === "function" ? children() : children}</>;
  }
};

export default ScreenStates;
