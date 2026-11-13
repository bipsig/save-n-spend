import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { InvestmentReport } from "@save-n-spend/types";
import AppSheet from "@/components/sheets/AppSheet";
import FormatCards from "@/components/sheets/FormatCards";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Toggle from "@/components/ui/Toggle";
import { AppText } from "@/components/ui/AppText";
import type { ExportFormat } from "@/lib/export";
import { exportInvestments, fetchInvestmentReport } from "@/lib/investmentsExport";
import {
  PRESETS, SECTIONS, availableFys, estimatePages, fyLabel, ledgerInPeriod, matchPreset, monthLabel,
  periodBounds, periodLabel, presetSections, type Period, type PresetKey, type SectionKey,
} from "@/lib/investmentsReportMath";
import { haptics } from "@/lib/haptics";
import { appZone, monthKeyOf } from "@/lib/zone";
import { toast } from "@/store/toast";
import { useConnectivity } from "@/store/connectivity";
import { colors, spacing } from "@/theme";

export type InvestmentsExportHandle = { present: () => void; dismiss: () => void };

type Props = {
  /** A holding's id when opened from its own page; null for the whole portfolio. */
  holdingId?: string | null;
};

const Caps = ({ children }: { children: React.ReactNode }) => (
  <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>{children}</AppText>
);

const monthOf = (iso: string) => monthKeyOf(new Date(iso), appZone());

const InvestmentsExportSheet = forwardRef<InvestmentsExportHandle, Props>(({ holdingId = null }, ref) => {
  const innerRef = useRef<BottomSheetModal>(null);
  const offline = useConnectivity((s) => s.offline);
  const scope = holdingId ? "holding" : "all";

  const [report, setReport] = useState<InvestmentReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<Period>({ kind: "all" });
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [sections, setSections] = useState<SectionKey[]>(() => presetSections("full", scope));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "warning" | "danger" } | null>(null);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      setReport(await fetchInvestmentReport());
    }
    catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Couldn't load your investments.", tone: "danger" });
    }
    finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    present: () => {
      // Every opening starts from the full statement over all time, on fresh figures.
      setPeriod({ kind: "all" });
      setFormat("pdf");
      setSections(presetSections("full", scope));
      void load();
      innerRef.current?.present();
    },
    dismiss: () => innerRef.current?.dismiss(),
  }), [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const holding = holdingId && report ? report.trend.holdings.find((h) => h.id === holdingId) ?? null : null;
  const series = holding ?? report?.trend ?? null;
  const months = useMemo(() => (series ? series.points.map((p) => p.month) : []), [series]);
  const bounds = periodBounds(period, months);
  const fys = months.length ? availableFys(months[0], months[months.length - 1]) : [];

  const ledgerRows = useMemo(() => {
    if (!report || !bounds) return 0;
    return ledgerInPeriod(report.ledger.filter((e) => !holdingId || e.holdingId === holdingId), bounds, monthOf).length;
  }, [report, bounds, holdingId]);

  const preset = matchPreset(sections, scope);
  const pages = estimatePages(sections, holding ? 1 : report?.trend.holdings.length ?? 0, ledgerRows);
  const total = SECTIONS[scope].reduce((n, g) => n + g.items.length, 0);

  const flip = (key: SectionKey, on: boolean) =>
    setSections((cur) => (on ? [...cur, key] : cur.filter((k) => k !== key)));

  const dates = bounds
    ? `${monthLabel(bounds.from)} – ${monthLabel(bounds.to)} · ${months.filter((m) => m >= bounds.from && m <= bounds.to).length} month${months.length === 1 ? "" : "s"} of history`
    : null;
  const emptyPeriod = !!report && months.length > 0 && !bounds;
  const noHoldings = !!report && months.length === 0;
  const csv = format === "csv";
  const nothing = !csv && sections.length === 0;

  const label = offline ? "Needs a connection"
    : loading ? "Loading…"
      : noHoldings ? "No investments yet"
        : emptyPeriod ? `Nothing in ${periodLabel(period, null)}`
          : nothing ? "Pick at least one section"
            : busy ? "Preparing…" : `Export ${format.toUpperCase()}`;
  const blocked = offline || loading || !report || noHoldings || emptyPeriod || nothing;

  const run = async () => {
    if (!report) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await exportInvestments(report, { holdingId, period, sections: csv ? ["ledger"] : sections, format });
      if (!res.shared) {
        haptics.warning();
        setMessage({ text: "There's nothing to export for that choice — try a wider period.", tone: "warning" });
        return;
      }
      innerRef.current?.dismiss();
      const what = holding ? holding.name : csv ? "Investments ledger" : "Investments statement";
      toast.success(`${what} exported as ${format.toUpperCase()}`);
    }
    catch (err) {
      haptics.error();
      setMessage({ text: err instanceof Error ? err.message : "Couldn't export. Try again.", tone: "danger" });
    }
    finally {
      setBusy(false);
    }
  };

  const chips: { key: string; label: string; period: Period }[] = [
    { key: "6m", label: "6M", period: { kind: "6m" } },
    { key: "1y", label: "1Y", period: { kind: "1y" } },
    { key: "all", label: "All time", period: { kind: "all" } },
    ...fys.map((y) => ({ key: `fy${y}`, label: fyLabel(y), period: { kind: "fy", start: y } as Period })),
  ];
  const isOn = (p: Period) => p.kind === period.kind && (p.kind !== "fy" || (period.kind === "fy" && p.start === period.start));

  return (
    <AppSheet
      ref={innerRef}
      scrollable
      onDismiss={() => { setBusy(false); setMessage(null); }}
      footer={
        <View style={styles.footer}>
          {!csv && !blocked && (
            <AppText size="xs" color="inkDim" style={styles.center}>
              {`${sections.length} of ${total} sections · about ${pages} page${pages === 1 ? "" : "s"}`}
            </AppText>
          )}
          {message && <AppText size="sm" color={message.tone} style={styles.center}>{message.text}</AppText>}
          <Button label={label} icon={blocked || busy ? undefined : "download"} loading={busy || loading} disabled={blocked} onPress={run} />
        </View>
      }
    >
      <View style={styles.identity}>
        <Icon name="download" container="square" gradient="accent" size={24} containerSize={52} />
        <View style={styles.identityText}>
          <AppText size="md" weight="black">{holding ? `Export ${holding.name}` : "Export investments"}</AppText>
          <AppText size="sm" color="inkDim">
            {offline
              ? "You're offline — a statement built from what's cached could miss recent changes, so this waits for a connection."
              : "Build a statement as a PDF, or the ledger as a spreadsheet."}
          </AppText>
        </View>
      </View>

      <View style={styles.section}>
        <Caps>Scope</Caps>
        <View style={styles.chips}>
          <Chip label={holding ? holding.name : report ? `All holdings · ${report.trend.holdings.length}` : "All holdings"} selected />
        </View>
      </View>

      <View style={styles.section}>
        <Caps>Period</Caps>
        <View style={styles.chips}>
          {chips.map((c) => (
            <Chip key={c.key} label={c.label} selected={isOn(c.period)} onPress={() => setPeriod(c.period)} />
          ))}
        </View>
        {dates && <AppText size="xs" color="inkDim">{dates}</AppText>}
        {emptyPeriod && <AppText size="xs" color="warning">{`Your history starts ${monthLabel(months[0])}.`}</AppText>}
      </View>

      <View style={styles.section}>
        <Caps>Format</Caps>
        <FormatCards value={format} onChange={setFormat} />
      </View>

      {csv ? (
        <View style={styles.section}>
          <Caps>Contents</Caps>
          <AppText size="sm" color="inkDim">
            Ledger · every contribution, redemption and value update as a row. A spreadsheet can't hold charts — choose PDF for those.
          </AppText>
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <Caps>Start from</Caps>
            <SegmentedControl
              segments={[...PRESETS, ...(preset === null ? [{ key: "custom" as const, label: "Custom" }] : [])]}
              value={(preset ?? "custom") as PresetKey | "custom"}
              onChange={(k) => { if (k !== "custom") setSections(presetSections(k, scope)); }}
            />
          </View>
          {SECTIONS[scope].map((group) => (
            <View key={group.group} style={styles.section}>
              <Caps>{group.group}</Caps>
              {group.items.map((item) => (
                <View key={item.key} style={styles.row}>
                  <View style={styles.rowText}>
                    <AppText size="sm" weight="bold">{item.label}</AppText>
                    <AppText size="xs" color="inkDim">{item.sub}</AppText>
                  </View>
                  <Toggle value={sections.includes(item.key)} onValueChange={(on) => flip(item.key, on)} />
                </View>
              ))}
            </View>
          ))}
        </>
      )}
    </AppSheet>
  );
});

InvestmentsExportSheet.displayName = "InvestmentsExportSheet";

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  identityText: { flex: 1, gap: 3 },
  section: { gap: spacing.sm },
  caps: { letterSpacing: 1.3, textTransform: "uppercase" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  rowText: { flex: 1, gap: 2 },
  footer: { gap: spacing.sm },
  center: { textAlign: "center" },
});

export default InvestmentsExportSheet;
