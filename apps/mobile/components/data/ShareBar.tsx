import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import formatMoney from "@/lib/money";

type Datum = { id: string; name: string; total: number; pct: number; color: string };

type Props = {
  data: Datum[];
  activeIndex?: number | null; // controlled tooltip index (screen owns it)
  onScrub?: (i: number | null) => void;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Spec "where it left from" — a stacked share bar. The bar itself is only 12px
// tall, so the responder lives on a taller transparent hit strip around it
// (otherwise the tap keeps missing the bar and bubbles to the screen's clear-tip
// Pressable). Tapping a segment shows its exact amount in a callout below.
const ShareBar = ({ data, activeIndex, onScrub }: Props) => {
  const [w, setW] = useState(0);
  const active = activeIndex ?? null;
  const sum = data.reduce((a, d) => a + d.pct, 0) || 100;

  const pick = (locationX: number) => {
    if (w <= 0 || data.length === 0) return;
    const target = clamp(locationX / w, 0, 1) * sum;
    let acc = 0;
    for (let i = 0; i < data.length; i++) {
      acc += data[i].pct;
      if (target <= acc) return onScrub?.(i);
    }
    onScrub?.(data.length - 1);
  };

  const d = active !== null ? data[active] : null;

  return (
    <View style={styles.wrap}>
      <View
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
            {`${Math.round(d.pct)}%`}
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
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
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
