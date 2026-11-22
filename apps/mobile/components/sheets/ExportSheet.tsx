import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import AppSheet from "@/components/sheets/AppSheet";
import FormatCards from "@/components/sheets/FormatCards";
import Button from "@/components/ui/Button";
import Caps from "@/components/ui/Caps";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Icon from "@/components/ui/Icon";
import { AppText } from "@/components/ui/AppText";
import { RANGES, rangeNavLabel, type RangeKey } from "@/lib/dateRange";
import { relativePeriod } from "@/lib/format/period";
import { count } from "@/lib/format/count";
import { exportTransactions, type ExportFormat } from "@/lib/export";
import { exportInsightsWindow } from "@/lib/insightsExport";
import type { InsightsSummary } from "@save-n-spend/types";
import { haptics } from "@/lib/haptics";
import { toast } from "@/store/toast";
import { useConnectivity } from "@/store/connectivity";
import { spacing } from "@/theme";
import type { ColorToken } from "@/theme";
import { errorText } from "@/lib/apiError";

type Props = {
  /** What is being exported. Transactions can be a spreadsheet or a document; insights is a
   *  document only — its value is the charts, which a spreadsheet can't hold. */
  kind?: "transactions" | "insights";
  /** The page's current range/offset — the export sheet opens on it. */
  defaultRange?: RangeKey;
  defaultOffset?: number;
  /** Insights: the summary already on screen, reused when the picked span is the one in view. */
  insightsData?: InsightsSummary | null;
};

// The span inside a sentence: "this week" in lower case, but "September 2026" as written.
const periodPhrase = (range: RangeKey, offset: number): string =>
  relativePeriod(range, offset)?.toLowerCase() ?? rangeNavLabel(range, offset);

// Export the transactions of a chosen time span as CSV or PDF, then open the
// native share sheet. One decision per row, a live CTA, per the spec T1 sheet.
const ExportSheet = forwardRef<BottomSheetModal, Props>(({ kind = "transactions", defaultRange = "month", defaultOffset = 0, insightsData }, ref) => {
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  // A stale export reads as authoritative in a way a stale screen doesn't — it's a file
  // someone hands to their accountant — so this is refused outright rather than served
  // from what's cached, unlike the rest of the app.
  const offline = useConnectivity((s) => s.offline);

  const [range, setRange] = useState<RangeKey>(defaultRange);
  // Carries the page's offset only while the picked range matches the page's —
  // pick a different span and it exports that span's current window.
  const [offset, setOffset] = useState(defaultOffset);
  const insights = kind === "insights";
  const [chosen, setFormat] = useState<ExportFormat>("csv");
  const format: ExportFormat = insights ? "pdf" : chosen;
  const spans = insights ? RANGES.filter((r) => r.key !== "all") : RANGES;
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
      const res = insights
        ? await exportInsightsWindow(
            range as "day" | "week" | "month" | "year",
            offset,
            range === defaultRange && offset === defaultOffset ? insightsData : null,
          )
        : await exportTransactions(format, range, offset);
      if (!res.shared) {
        // Stays in the sheet, because the fix is the range chips right above it.
        haptics.warning();
        setMessage({
          text: `No transactions in ${periodPhrase(range, offset)} to export.`,
          tone: "warning",
        });
        return;
      }
      innerRef.current?.dismiss();
      // The share sheet already proved something happened, so this is here for the
      // count — the one fact the user can't see anywhere else, and the one that says
      // whether the span they picked was the span they meant.
      // "<what> exported as <FORMAT>", whichever report it was.
      toast.success(
        `${insights
          ? `Insights for ${periodPhrase(range, offset)}`
          : count(res.count, "transaction")} exported as ${format.toUpperCase()}`
      );
    } catch (err) {
      haptics.error();
      setMessage({
        text: errorText(err, "Couldn't export. Try again."),
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
          label={offline ? "Needs a connection" : busy ? "Preparing…" : `Export ${format.toUpperCase()}`}
          icon={offline || busy ? undefined : "download"}
          loading={busy}
          disabled={offline}
          onPress={run}
        />
      }
    >
      <View style={styles.identity}>
        <Icon name="download" container="square" gradient="accent" size={24} containerSize={52} />
        <View style={styles.identityText}>
          <AppText size="md" weight="black">
            {insights ? "Export insights" : "Export transactions"}
          </AppText>
          <AppText size="sm" color="inkDim">
            {offline
              ? "You're offline — a file built from what's cached could miss recent transactions, so this waits for a connection."
              : "Pick a span and format — we'll build the file and open your share sheet."}
          </AppText>
        </View>
      </View>

      <View style={styles.section}>
        <Caps>Time span</Caps>
        <SegmentedControl segments={spans} value={range} onChange={pickRange} accessibilityLabel="Time span" />
        <AppText size="xs" color="inkDim">
          {`Exporting ${periodPhrase(range, offset)}`}
        </AppText>
      </View>

      <View style={styles.section}>
        <Caps>Format</Caps>
        <FormatCards value={format} onChange={setFormat} unavailable={insights ? ["csv"] : []} />
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
  message: {
    textAlign: "center",
  },
});

export default ExportSheet;
