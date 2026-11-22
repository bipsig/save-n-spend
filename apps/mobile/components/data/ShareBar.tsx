import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { formatPct } from "@/lib/format/pct";
import { chartA11y, chartSummary } from "@/lib/chartSummary";
import { useScrubTick } from "@/lib/useScrubTick";
import { colors } from "@/theme";

type Datum = { id: string; name: string; total: number; pct: number; color: string };

type Props = {
  /** Names the bar for VoiceOver ("Where it left from"). */
  title: string;
  data: Datum[];
  activeIndex?: number | null; // controlled tooltip index (screen owns it)
  onScrub?: (i: number | null) => void;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Spec "where it left from" — a stacked share bar. The bar itself is only 12px
// tall, so the responder lives on a taller transparent hit strip around it
// (otherwise the tap keeps missing the bar and bubbles to the screen's clear-tip
// Pressable). Tapping a segment shows its exact amount in a callout below.
const ShareBar = ({ title, data, activeIndex, onScrub }: Props) => {
  const masked = usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  const [w, setW] = useState(0);
  const active = activeIndex ?? null;
  const sum = data.reduce((a, d) => a + d.pct, 0) || 100;

  // Ticks as the finger crosses a segment boundary, and only then — the segments
  // are uneven, so the tick is the only thing that says where one account ends.
  const scrub = useScrubTick(active, onScrub);

  const pick = (locationX: number) => {
    if (w <= 0 || data.length === 0) return;
    const target = clamp(locationX / w, 0, 1) * sum;
    let acc = 0;
    for (let i = 0; i < data.length; i++) {
      acc += data[i].pct;
      if (target <= acc) return scrub(i);
    }
    scrub(data.length - 1);
  };

  const d = active !== null ? data[active] : null;

  // Largest share first, as the bar is drawn; three is enough to say where most of it went.
  const summary = chartSummary({
    title,
    masked,
    parts: [...data]
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
      .map((seg) => `${seg.name} ${formatMoney(seg.total)} (${formatPct(seg.pct)})`),
  });

  return (
    <View style={styles.wrap}>
      <View
        {...chartA11y(summary)}
        style={styles.hit}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
        onResponderMove={(e) => pick(e.nativeEvent.locationX)}
        onResponderTerminationRequest={() => true}
      >
        <View style={styles.bar}>
          {data.map((seg, i) => (
            <View
              key={seg.id}
              style={{
                flex: Math.max(seg.pct, 0.5),
                backgroundColor: seg.color,
                opacity: active === null || active === i ? 1 : 0.35,
              }}
            />
          ))}
        </View>
      </View>

      {d && (
        <View style={styles.detail}>
          <View style={[styles.dot, { backgroundColor: d.color }]} />
          <AppText size="sm" weight="bold" numberOfLines={1} style={styles.name}>
            {d.name}
          </AppText>
          <AppText size="sm" weight="bold">
            {formatMoney(d.total)}
          </AppText>
          <AppText size="xs" color="inkDim">
            {formatPct(d.pct)}
          </AppText>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  hit: {
    paddingVertical: 16,
    marginVertical: -16, // keep the visual footprint tight; the pad is only for touch
    justifyContent: "center",
  },
  bar: {
    flexDirection: "row",
    height: 12,
    borderRadius: 6,
    overflow: "hidden",
    gap: 2,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  detail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  name: {
    flex: 1,
  },
});

export default ShareBar;
