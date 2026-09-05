import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import AppSheet from "@/components/sheets/AppSheet";
import FormatCards from "@/components/sheets/FormatCards";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import { AppText } from "@/components/ui/AppText";
import { RANGES, rangeNavLabel, type RangeKey } from "@/lib/dateRange";
import { exportTransactions, type ExportFormat } from "@/lib/export";
import { haptics } from "@/lib/haptics";
import { toast } from "@/store/toast";
import { spacing } from "@/theme";
import type { ColorToken } from "@/theme";

type Props = {
  /** The Activity page's current range/offset — the export sheet opens on it. */
  defaultRange?: RangeKey;
  defaultOffset?: number;
};

const Caps = ({ children }: { children: React.ReactNode }) => (
  <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>
    {children}
  </AppText>
);

// Export the transactions of a chosen time span as CSV or PDF, then open the
// native share sheet. One decision per row, a live CTA, per the spec T1 sheet.
const ExportSheet = forwardRef<BottomSheetModal, Props>(({ defaultRange = "month", defaultOffset = 0 }, ref) => {
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);

  const [range, setRange] = useState<RangeKey>(defaultRange);
  // Carries the page's offset only while the picked range matches the page's —
  // pick a different span and it exports that span's current window.
  const [offset, setOffset] = useState(defaultOffset);
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [busy, setBusy] = useState(false);
  // Tone as well as text: "nothing in this span" is not a failure, it's a nudge to
  // widen the range, and painting it the same red as a broken export overstates it.
  const [message, setMessage] = useState<{ text: string; tone: ColorToken } | null>(null);

  // Follow the page's range/offset while the sheet is closed, so it opens on the
  // exact window the user is looking at.
  useEffect(() => {
    if (!busy) {
      setRange(defaultRange);
      setOffset(defaultOffset);
    }
  }, [defaultRange, defaultOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickRange = (r: RangeKey) => {
    setRange(r);
    setOffset(r === defaultRange ? defaultOffset : 0);
  };

  const reset = () => {
    setBusy(false);
    setMessage(null);
  };

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await exportTransactions(format, range, offset);
      if (!res.shared) {
        // Stays in the sheet, because the fix is the range chips right above it.
        haptics.warning();
        setMessage({
          text: `No transactions in ${rangeNavLabel(range, offset).toLowerCase()} to export.`,
          tone: "warning",
        });
        return;
      }
      innerRef.current?.dismiss();
      // The share sheet already proved something happened, so this is here for the
      // count — the one fact the user can't see anywhere else, and the one that says
      // whether the span they picked was the span they meant.
      toast.success(
        `${res.count} transaction${res.count === 1 ? "" : "s"} exported as ${format.toUpperCase()}`
      );
    } catch (err) {
      haptics.error();
      setMessage({
        text: err instanceof Error ? err.message : "Couldn't export. Try again.",
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppSheet
      ref={innerRef}
      onDismiss={reset}
      footer={
        <Button
          label={busy ? "Preparing…" : `Export ${format.toUpperCase()}`}
          icon={busy ? undefined : "download"}
          loading={busy}
          onPress={run}
        />
      }
    >
      <View style={styles.identity}>
        <Icon name="download" container="square" gradient="accent" size={24} containerSize={52} />
        <View style={styles.identityText}>
          <AppText size="md" weight="black">
            Export transactions
          </AppText>
          <AppText size="sm" color="inkDim">
            Pick a span and format — we&apos;ll build the file and open your share sheet.
          </AppText>
        </View>
      </View>

      <View style={styles.section}>
        <Caps>Time span</Caps>
        <View style={styles.chips}>
          {RANGES.map((r) => (
            <Chip
              key={r.key}
              label={r.label}
              selected={range === r.key}
              onPress={() => pickRange(r.key)}
            />
          ))}
        </View>
        <AppText size="xs" color="inkDim">
          {`Exporting ${rangeNavLabel(range, offset)}`}
        </AppText>
      </View>

      <View style={styles.section}>
        <Caps>Format</Caps>
        <FormatCards value={format} onChange={setFormat} />
      </View>

      {message && (
        <AppText size="sm" color={message.tone} style={styles.message}>
          {message.text}
        </AppText>
      )}
    </AppSheet>
  );
});

ExportSheet.displayName = "ExportSheet";

const styles = StyleSheet.create({
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  identityText: {
    flex: 1,
    gap: 3,
  },
  section: {
    gap: spacing.sm,
  },
  caps: {
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  message: {
    textAlign: "center",
  },
});

export default ExportSheet;
