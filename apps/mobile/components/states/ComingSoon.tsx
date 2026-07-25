import ScreenScaffold from "@/components/shell/ScreenScaffold";
import EmptyState from "@/components/states/EmptyState";
import type { IconName } from "@/lib/icons";

type Props = {
  // The screen title in the header (e.g. "Budget").
  title: string;
  // The feature disc icon — defaults to a star.
  icon?: IconName;
  // One honest sentence about what's landing here.
  blurb?: string;
};

// A shared honest placeholder for surfaces not yet backed by the real API.
// Reuses the spec .emptyblock look via EmptyState — soft violet disc, headline,
// one human sentence — under a normal titled scaffold so the header/tab reads
// as a real destination, just not built yet.
const ComingSoon = ({ title, icon = "star", blurb }: Props) => (
  <ScreenScaffold title={title}>
    <EmptyState
      icon={icon}
      title="Coming soon"
      subtitle={blurb ?? "We're building this. It'll light up in a future update."}
    />
  </ScreenScaffold>
);

export default ComingSoon;
