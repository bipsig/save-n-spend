import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import Card from "@/components/data/Card";
import { AppText } from "./AppText";
import Caps from "./Caps";
import { haptics } from "@/lib/haptics";
import { MASKED_MONEY, formatMoneyExact, usePrivacyMask } from "@/lib/money";
import { fitFontSize, statColumns, toRows } from "@/lib/fitText";
import { zeroNeutral } from "@/lib/signTone";
import { useSettings } from "@/store/settings";
import { caps, spacing } from "@/theme";
import type { CapsSize, ColorToken, FontSizeToken } from "@/theme";

type Size = "sm" | "md" | "lg";
type Surface = "card" | "plain" | "gradient";

export type StatTileProps = {
  /** Sentence case; shown as a caption above the figure. */
  label: string;
  /** Integer paise. Masked in privacy mode; tapping the tile then peeks. */
  amount?: number;
  /** A figure that isn't money ("30.0%"). Ignored when `amount` is set. */
  text?: string;
  /** Write "+" or "−" in front of `amount`, kept while masked. */
  signed?: boolean;
  /** Formats `amount` (signed paise, sign included in the result). Defaults to today's exact
   *  formatter; round 2 passes the `lib/format` one. */
  format?: (paise: number) => string;
  /** Figure colour. */
  tone?: ColorToken;
  /** The line under the figure ("+6.8% vs Sep"). */
  change?: { text: string; tone?: ColorToken } | null;
  size?: Size;
  surface?: Surface;
  style?: StyleProp<ViewStyle>;
  /** Set by a StatRow: one caption size for the whole row, so the captions stay on one line
   *  and the figures line up. A lone tile's caption may wrap to two lines instead. */
  capsSize?: number;
};

// A row's captions shrink to this share of their size before they end in "…".
const CAPS_MIN_SCALE = 0.8;

// `min` is the smallest the figure shrinks to before a StatRow reflows (Q4: Trends 15 → 13).
const SIZE: Record<Size, { font: FontSizeToken; min: number; caps: CapsSize; padV: number; padH: number }> = {
  sm: { font: "sm", min: 13, caps: "sm", padV: 10, padH: 10 },
  md: { font: "md", min: 15, caps: "md", padV: 12, padH: 14 },
  lg: { font: "lg", min: 17, caps: "md", padV: 14, padH: 16 },
};

// iOS shrinks the figure only as far as it has to. In a StatRow that never goes below the
// size's `min`, because the row drops a column first; a lone tile in a slot too narrow keeps
// shrinking down to this rather than cutting a digit.
const FLOOR_SCALE = 0.7;

const signChar = (paise: number) => (paise > 0 ? "+" : paise < 0 ? "−" : "");

const defaultFormat = (signed: boolean) => (p: number) =>
  signed ? `${signChar(p)}${formatMoneyExact(Math.abs(p))}` : formatMoneyExact(p);

/** The figure exactly as the tile shows it. */
export const statFigure = (p: StatTileProps, masked: boolean): string => {
  if (p.amount === undefined) return p.text ?? "";
  if (masked) return `${p.signed ? signChar(p.amount) : ""}${MASKED_MONEY}`;
  return (p.format ?? defaultFormat(!!p.signed))(p.amount);
};

/**
 * Label above the figure (D4 A), optional change line under it. The figure is never rounded:
 * it shrinks to fit, and a StatRow reflows when even the smallest size can't hold it.
 */
const StatTile = (p: StatTileProps) => {
  const masked = usePrivacyMask();
  const peek = useSettings((s) => s.peek);
  const { label, change, size = "md", surface = "card", style } = p;
  const s = SIZE[size];
  const onGradient = surface === "gradient";
  const figure = statFigure(p, masked);
  const isMasked = masked && p.amount !== undefined;

  const body = (
    <>
      <Caps
        size={s.caps}
        color={onGradient ? "onGradientDim" : "inkDim"}
        numberOfLines={p.capsSize ? 1 : 2}
        style={p.capsSize ? { fontSize: p.capsSize, letterSpacing: (caps[s.caps].letterSpacing * p.capsSize) / caps[s.caps].fontSize } : undefined}
      >
        {label}
      </Caps>
      <AppText
        size={s.font}
        weight="black"
        color={(isMasked ? p.tone : zeroNeutral(p.amount ?? 1, p.tone)) ?? (onGradient ? "surface" : "ink")}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={FLOOR_SCALE}
      >
        {figure}
      </AppText>
      {change && (
        // Two lines rather than a cut: "−51.5 pts vs the week before" in a half-width tile.
        <AppText size="xs" weight="semibold" color={change.tone ?? (onGradient ? "onGradientDim" : "inkDim")} numberOfLines={2}>
          {change.text}
        </AppText>
      )}
    </>
  );

  const a11yLabel = isMasked
    ? `${label}, amount hidden`
    : [label, figure, change?.text].filter(Boolean).join(", ");
  const boxStyle = [styles.box, surface === "card" && { paddingVertical: s.padV, paddingHorizontal: s.padH }];

  // While masked the whole tile is the peek target, like a masked <Money>, and a bigger one.
  const content = isMasked ? (
    <Pressable
      onPress={() => {
        haptics.toggle();
        peek();
      }}
      style={boxStyle}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Shows amounts for ten seconds"
    >
      {body}
    </Pressable>
  ) : (
    <View style={boxStyle} accessible accessibilityLabel={a11yLabel}>
      {body}
    </View>
  );

  return surface === "card" ? (
    <Card padded={false} style={style}>
      {content}
    </Card>
  ) : (
    <View style={style}>{content}</View>
  );
};

type RowProps = {
  items: Omit<StatTileProps, "size" | "surface" | "style" | "capsSize">[];
  size?: Size;
  surface?: Surface;
  /** Most tiles across (e.g. 2 for Review's two-by-two). Defaults to all of them. */
  columns?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Tiles side by side, equal widths. When a figure can't fit its share of the row even at the
 * size's minimum, the row drops to fewer columns (3 → 2 + 1 → 1); a short last row's tiles
 * grow to fill it.
 */
export const StatRow = ({ items, size = "md", surface = "card", columns, gap = spacing.sm, style }: RowProps) => {
  const [width, setWidth] = useState(0);
  const [labelWidths, setLabelWidths] = useState<Record<string, number>>({});
  const s = SIZE[size];
  // Columns come from the exact figures even while masked, so a peek doesn't reflow the row.
  const fit = statColumns(items.map((i) => statFigure(i, false)), width, {
    gap,
    padding: surface === "card" ? s.padH : 0,
    fontSize: s.min,
    // AppText tracks black text tight by 2% of its size.
    letterSpacing: -0.02 * s.min,
  });
  const cols = Math.min(columns ?? items.length, fit);
  // A card's 1 pt border sits inside its width; 1 pt more each side absorbs sub-point rounding.
  const padding = surface === "card" ? s.padH + 2 : 1;
  const inner = width > 0 ? (width - gap * (cols - 1)) / cols - 2 * padding : 0;
  const widestLabel = Math.max(0, ...items.map((i) => labelWidths[i.label] ?? 0));
  const capsSize = fitFontSize(widestLabel, inner, caps[s.caps].fontSize, CAPS_MIN_SCALE);

  return (
    <View style={[{ gap }, style]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {toRows(items, cols).map((row, r) => (
        <View key={r} style={[styles.row, { gap }]}>
          {row.map((item) => (
            <StatTile key={item.label} {...item} size={size} surface={surface} style={styles.cell} capsSize={capsSize} />
          ))}
        </View>
      ))}
      {/* Each caption measured once at full size, off screen, to pick the row's caption size. */}
      <View style={styles.measure} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {items.map((item) => (
          <Caps
            key={item.label}
            size={s.caps}
            numberOfLines={1}
            onTextLayout={(e) => {
              const w = e.nativeEvent.lines[0]?.width ?? 0;
              setLabelWidths((m) => (m[item.label] === w ? m : { ...m, [item.label]: w }));
            }}
          >
            {item.label}
          </Caps>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  box: { gap: 2 },
  row: { flexDirection: "row" },
  cell: { flex: 1, minWidth: 0 },
  measure: { position: "absolute", left: 0, top: 0, width: 4000, height: 0, overflow: "hidden", opacity: 0 },
});

export default StatTile;
