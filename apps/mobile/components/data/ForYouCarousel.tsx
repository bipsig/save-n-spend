import { Dimensions, ScrollView, StyleSheet, View } from "react-native";
import SectionHeader from "../ui/SectionHeader";
import { spacing } from "@/theme";

// Screen padding is 20 either side (see ScreenScaffold) — the slide width is a share of
// what's left, not the raw window width, so the mockup's "mostly one card, a peek of the
// next" proportion holds on every device size rather than only the one it was drawn on.
const CONTENT_WIDTH = Dimensions.get("window").width - 40;
const GAP = spacing.sm;
const SLIDE_WIDTH = CONTENT_WIDTH * 0.86;

/** A shared floor, not a measurement — the slides are independent, pre-built components,
 *  so there's no single layout pass that could measure "the tallest one" and feed it back
 *  to the others. Every slide commits to at least this height on its own Card instead, so
 *  they read as one consistent shelf no matter which combination is showing. Sized for the
 *  longest current content (a two-line highlight body); a taller one still grows past it
 *  rather than clipping. */
export const FOR_YOU_SLIDE_HEIGHT = 160;

type Props = {
  /** One entry per possible slide, in priority order. `null`/`undefined` entries are
   *  dropped rather than padded — a slide with nothing to say is absent, never a
   *  placeholder. The whole carousel disappears once every entry is empty. */
  slides: (React.ReactNode | null | undefined | false)[];
};

// Replaces what would otherwise be several separate vertical cards (a highlight, a goal's
// ETA, a no-spend-days count, a weekday pattern) with one horizontally swipeable stack —
// same signal, without permanently claiming that much vertical space for content that's
// often not there at all (a brand-new account has none of these yet).
const ForYouCarousel = ({ slides }: Props) => {
  const visible = slides.filter((slide): slide is React.ReactNode => !!slide);

  if (visible.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader label="FOR YOU" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={SLIDE_WIDTH + GAP}
        snapToAlignment="start"
        contentContainerStyle={styles.track}
      >
        {visible.map((slide, i) => (
          <View key={i} style={styles.slide}>
            {slide}
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  track: {
    gap: GAP,
    paddingRight: spacing.md, // hints at more when the row scrolls
  },
  slide: {
    width: SLIDE_WIDTH,
  },
});

export default ForYouCarousel;
