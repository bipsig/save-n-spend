import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import BackButton from "@/components/shell/BackButton";
import Card from "@/components/data/Card";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Chip from "@/components/ui/Chip";
import Button from "@/components/ui/Button";
import { AppText } from "@/components/ui/AppText";
import EmptyState from "@/components/states/EmptyState";
import { get } from "@/lib/api";
import {
  applyFilter, detailOf, formatMs, groupByTime, kindOf, labelOf, summarise,
  type DiagFilter, type DiagRow, type LogKind,
} from "@/lib/diagnostics";
import { useRequestLog } from "@/store/requestLog";
import { useSettings } from "@/store/settings";
import { toast } from "@/store/toast";
import { colors, spacing } from "@/theme";

// Settings → Diagnostics, switched on by tapping Version seven times. A developer's view of
// what the app has been doing: today's summary, filters, then every call in plain words —
// failures open up to show the error and the reference that finds it in the server log.
//
// "This phone" is kept on the device, so it includes calls that never reached the server
// (offline, asleep). "Server" is the server's own log for this account, plus errors the app
// reported and notifications raised.

type ServerRow = {
  requestId: string | null;
  source: "api" | "app" | "job";
  route: string;
  status: number | null;
  durationMs: number | null;
  message: string | null;
  createdAt: string;
};

const DOT: Record<LogKind, string> = {
  ok: colors.success,
  rejected: colors.warning,
  noReply: colors.warning,
  failed: colors.danger,
  appError: colors.danger,
  notification: colors.info,
};

/** The server logs "GET /api/v1/bills"; the phone knows "/bills". One shape for both. */
const fromServer = (r: ServerRow): DiagRow => {
  if (r.source !== "api") return { ...r, method: null, at: r.createdAt };
  const [method, path = ""] = r.route.split(" ");
  return { ...r, method, route: path.replace(/^\/api\/v1/, "") || "/", at: r.createdAt };
};

const TimelineRow = ({ row }: { row: DiagRow }) => {
  const kind = kindOf(row);
  const failed = kind === "failed" || kind === "rejected" || kind === "noReply" || kind === "appError"
    || (kind === "notification" && !!row.message?.startsWith("failed"));
  const detail = detailOf(row);
  return (
    <View style={styles.tl}>
      <View style={[styles.dot, { backgroundColor: failed && kind === "notification" ? colors.danger : DOT[kind] }]} />
      <View style={styles.tlText}>
        <AppText size="sm" weight="bold" numberOfLines={2}>{labelOf(row)}</AppText>
        {kind === "notification" && row.message && !failed && (
          <AppText size="xs" color="inkDim" numberOfLines={2}>{row.message}</AppText>
        )}
        {failed && (
          <View style={[styles.box, kind === "rejected" || kind === "noReply" ? styles.boxWarn : styles.boxBad]}>
            {detail && <AppText size="xs" color="inkSecondary" selectable numberOfLines={4}>{detail}</AppText>}
            <AppText size="xs" color="inkDim">
              {row.requestId && <AppText size="xs" weight="black" color="ink" selectable style={styles.ref}>Ref {row.requestId}</AppText>}
              {row.status ? ` · ${row.status}` : ""}
            </AppText>
          </View>
        )}
      </View>
      {row.durationMs !== null && <AppText size="xs" color="inkDim">{formatMs(row.durationMs)}</AppText>}
    </View>
  );
};

const DiagnosticsScreen = () => {
  const router = useRouter();
  const [view, setView] = useState<"phone" | "server">("phone");
  const [filter, setFilter] = useState<DiagFilter>("all");
  const local = useRequestLog((s) => s.entries);
  const [server, setServer] = useState<ServerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadServer = useCallback(async () => {
    setError(null);
    try {
      setServer(await get<ServerRow[]>("/diagnostics/requests"));
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the server log");
    }
  }, []);

  useFocusEffect(useCallback(() => { if (view === "server") void loadServer(); }, [view, loadServer]));

  const rows: DiagRow[] = useMemo(() => (view === "phone"
    ? local.map((e) => ({ requestId: e.requestId, source: "api" as const, method: e.method, route: e.route, status: e.status, durationMs: e.durationMs, message: e.message ?? null, at: e.at }))
    : (server ?? []).map(fromServer)), [view, local, server]);

  const summary = summarise(rows);
  const shown = applyFilter(rows, filter);
  const groups = groupByTime(shown);

  // App errors and notifications only exist in the server's log.
  const filters: { key: DiagFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "failed", label: summary.failed ? `Failed · ${applyFilter(rows, "failed").length}` : "Failed" },
    { key: "slow", label: "Slow" },
    ...(view === "server" ? [{ key: "app" as const, label: "App errors" }, { key: "notify" as const, label: "Notifications" }] : []),
  ];

  const header = (
    <View style={styles.head}>
      <BackButton />
      <AppText size="xl" weight="black" style={styles.headTitle}>Diagnostics</AppText>
    </View>
  );

  return (
    <ScreenScaffold header={header} onRefresh={view === "server" ? loadServer : undefined}>
      <SegmentedControl
        segments={[{ key: "phone", label: "This phone" }, { key: "server", label: "Server" }]}
        value={view}
        onChange={(v) => { setView(v); setFilter("all"); }}
      />

      <Card style={styles.summary}>
        <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>
          {view === "phone" ? "Today on this phone" : "Today on the server"}
        </AppText>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <AppText size="xl" weight="black">{summary.calls}</AppText>
            <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>calls</AppText>
          </View>
          <View style={styles.stat}>
            <AppText size="xl" weight="black" color={summary.failed ? "danger" : "ink"}>{summary.failed}</AppText>
            <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>failed</AppText>
          </View>
          <View style={styles.stat}>
            <AppText size="xl" weight="black">{summary.typical !== null ? formatMs(summary.typical) : "—"}</AppText>
            <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>typical</AppText>
          </View>
        </View>
        {summary.slowest && (
          <AppText size="xs" color="inkDim" style={styles.slow}>
            Slowest: <AppText size="xs" weight="bold" color="ink">{labelOf(summary.slowest).replace(/^Loaded /, "")} · {formatMs(summary.slowest.durationMs ?? 0)}</AppText>
            {(summary.slowest.durationMs ?? 0) > 20_000 ? " (server waking up)" : ""}
          </AppText>
        )}
      </Card>

      <View style={styles.chips}>
        {filters.map((f) => (
          <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </View>

      {error && <AppText size="sm" color="danger">{error}</AppText>}

      {groups.length === 0 ? (
        <EmptyState
          icon="receipt"
          title={filter === "all" ? "Nothing yet" : "Nothing here"}
          subtitle={filter !== "all" ? "No calls match this filter." : view === "phone" ? "Calls show up here as you use the app." : "Nothing logged for your account in the last 7 days."}
        />
      ) : groups.map((g) => (
        <View key={g.label} style={styles.group}>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.caps}>{g.label}</AppText>
          <Card style={styles.card}>
            {g.rows.map((row, i) => <TimelineRow key={`${row.requestId ?? "x"}-${i}`} row={row} />)}
          </Card>
        </View>
      ))}

      <View style={styles.actions}>
        {/* Opens a screen that throws while rendering, to check the crash screen and that its
            report reaches the Server log. */}
        <Button label="Test the crash screen" variant="secondary" icon="info" onPress={() => router.push("/crash-test")} />
        {view === "phone" && local.length > 0 && (
          <Button label="Clear this list" variant="ghost" onPress={() => useRequestLog.getState().clear()} />
        )}
        <Button
          label="Turn off Diagnostics"
          variant="ghost"
          onPress={() => {
            useSettings.getState().update({ diagnostics: false });
            toast.info("Diagnostics off");
            router.back();
          }}
        />
      </View>
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headTitle: { flex: 1 },
  caps: { letterSpacing: 1.2, textTransform: "uppercase" },
  summary: { gap: spacing.sm },
  stats: { flexDirection: "row" },
  stat: { flex: 1, gap: 1 },
  slow: { paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  group: { gap: spacing.sm },
  card: { gap: 0 },
  tl: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: 8 },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 6 },
  tlText: { flex: 1, gap: 4 },
  box: { gap: 3, padding: 8, borderRadius: 12, borderWidth: 1 },
  boxWarn: { backgroundColor: "rgba(255,177,92,0.08)", borderColor: "rgba(255,177,92,0.25)" },
  boxBad: { backgroundColor: "rgba(255,107,116,0.08)", borderColor: "rgba(255,107,116,0.25)" },
  ref: { letterSpacing: 1 },
  actions: { gap: spacing.xs },
});

export default DiagnosticsScreen;
