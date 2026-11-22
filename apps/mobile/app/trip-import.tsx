import { useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { goBackOrHome } from "@/lib/navigation";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Caps from "@/components/ui/Caps";
import Chip from "@/components/ui/Chip";
import Icon from "@/components/ui/Icon";
import Money from "@/components/ui/Money";
import Toggle from "@/components/ui/Toggle";
import PressableScale from "@/components/ui/PressableScale";
import { AppText } from "@/components/ui/AppText";
import NotFoundState from "@/components/states/NotFoundState";
import AccountPickerSheet from "@/components/sheets/AccountPickerSheet";
import CategoryPickerSheet from "@/components/sheets/CategoryPickerSheet";
import BreakdownSheet, { type Part } from "@/components/sheets/BreakdownSheet";
import { useAccounts, useDefaultAccount } from "@/lib/accounts";
import { useCategories } from "@/lib/categories";
import { haptics } from "@/lib/haptics";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { commitImport, previewImport, useTrip, type ImportDecision, type ImportRow, type NameMapping } from "@/lib/trips";
import { useIdempotencyKey } from "@/lib/useIdempotencyKey";
import { useOnlineGate } from "@/lib/onlineGate";
import { count } from "@/lib/format/count";
import { formatCalendar } from "@/lib/format/date";
import { formatSpan } from "@/lib/format/period";
import { toast } from "@/store/toast";
import { colors, spacing } from "@/theme";
import { errorText } from "@/lib/apiError";
import { useFormError } from "@/lib/useFormError";
import FormError from "@/components/ui/FormError";

type Choice = { include: boolean; category: string | null; account: string | null; parts: Part[] | null };

const NEEDS_YOU = new Set(["matchesYours", "lump", "settlement", "pickAccount", "isThisYours"]);

/** A row's `YYYY-MM-DD` as "7 Dec". */
const rowDay = (key: string) => formatCalendar(key, "day");

const STATUS_TAG: Record<string, { label: string; tone: BadgeTone }> = {
  matchesYours: { label: "Matches yours", tone: "info" },
  lump: { label: "Lump", tone: "warning" },
  settlement: { label: "Settle-up", tone: "success" },
  pickAccount: { label: "You paid", tone: "info" },
  isThisYours: { label: "Is this yours?", tone: "neutral" },
};

// Importing a Splitwise group export into the trip: pick the file, say who's who once, then
// review. Rows that need a decision come first; everything else is ready to go. Nothing is
// saved until "Approve".
const TripImportScreen = () => {
  usePrivacyMask();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const allAccounts = useAccounts();
  const categories = useCategories();
  const defaultAccount = useDefaultAccount();
  const tripQuery = useTrip(id);
  const trip = tripQuery.data?.trip;
  const tripGone = !id || tripQuery.errorStatus === 404;
  const idem = useIdempotencyKey();

  const [csv, setCsv] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [mapping, setMapping] = useState<NameMapping>({});
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [summary, setSummary] = useState<{ myShare: number; balance: number; fileBalance: number | null; matchesFile: boolean } | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState(false);
  const { error, fail, clear: clearError } = useFormError();
  const [showSkipped, setShowSkipped] = useState(false);

  const personRef = useRef<BottomSheetModal>(null);
  const [personFor, setPersonFor] = useState<string | null>(null);
  const categoryRef = useRef<BottomSheetModal>(null);
  const accountRef = useRef<BottomSheetModal>(null);
  const breakdownRef = useRef<BottomSheetModal>(null);
  const [target, setTarget] = useState<string | null>(null);

  const pick = async () => {
    clearError();
    const result = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "text/plain", "public.comma-separated-values-text"] });
    if (result.canceled) return;
    setBusy(true);
    try {
      const text = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const preview = await previewImport(id, text);
      if (preview.needsMapping) {
        setCsv(text);
        setNames(preview.people);
        setMapping(preview.suggested);
      }
    }
    catch (err) {
      fail(errorText(err, "Couldn't read that file"));
    }
    finally {
      setBusy(false);
    }
  };

  const review = async () => {
    if (!csv) return;
    if (!Object.values(mapping).includes("me")) { fail("Pick which name is you."); return; }
    setBusy(true);
    clearError();
    try {
      const preview = await previewImport(id, csv, mapping);
      if (preview.needsMapping) return;
      setRows(preview.rows);
      setSummary(preview);
      setChoices(Object.fromEntries(preview.rows.map((r) => [r.key, {
        include: r.status !== "isThisYours" && r.status !== "skipped" && r.status !== "alreadyIn",
        category: r.suggestedCategory,
        account: defaultAccount?._id ?? null,
        parts: null,
      }])));
    }
    catch (err) {
      fail(errorText(err, "Couldn't read that file"));
    }
    finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!csv || !rows) return;
    const decisions: ImportDecision[] = rows.map((r) => {
      const c = choices[r.key];
      if (!c?.include || r.status === "skipped" || r.status === "alreadyIn") return { key: r.key, action: "skip" };
      if (r.status === "matchesYours") return { key: r.key, action: "apply" };
      return { key: r.key, action: "import", category: c.category, account: c.account, ...(c.parts ? { parts: c.parts } : {}) };
    });
    setBusy(true);
    try {
      const res = await commitImport(id, csv, mapping, decisions, {
        idempotencyKey: idem.keyFor("POST", `/trips/${id}/import/commit`, { csv, mapping, decisions }),
      });
      idem.reset();
      // No counts when the reply had none (see lib/replayed.ts); the write refreshes the trip page.
      toast.success(res
        ? `Imported ${count(res.added + res.applied, "expense")}${res.settled ? ` and ${count(res.settled, "settle-up")}` : ""}`
        : "Import saved");
      // Back to the trip — asking it to open "Match Splitwise" when simplification could have
      // changed anyone's number.
      if (res?.matchSplitwise) router.dismissTo({ pathname: "/trip-detail", params: { id, match: "1" } });
      else goBackOrHome();
    }
    catch (err) {
      fail(errorText(err, "Couldn't import"));
    }
    finally {
      setBusy(false);
    }
  };

  const setChoice = (key: string, patch: Partial<Choice>) => setChoices((c) => ({ ...c, [key]: { ...c[key], ...patch } }));
  const needsYou = (rows ?? []).filter((r) => NEEDS_YOU.has(r.status));
  const ready = (rows ?? []).filter((r) => r.status === "ready");
  const skipped = (rows ?? []).filter((r) => r.status === "skipped" || r.status === "alreadyIn");
  const approving = useMemo(() => (rows ?? []).filter((r) => choices[r.key]?.include && r.status !== "skipped" && r.status !== "alreadyIn").length, [rows, choices]);
  const catName = (cid: string | null) => categories.find((c) => c._id === cid)?.name;
  const accountName = (aid: string | null) => allAccounts.find((a) => a._id === aid)?.name;
  const targetRow = rows?.find((r) => r.key === target) ?? null;
  // Rows dated outside the trip — usually the wrong group's file, or the wrong trip.
  const outside = (r: ImportRow) =>
    !!trip && (r.date < trip.startDate.slice(0, 10) || r.date > trip.endDate.slice(0, 10));
  const outsideCount = (rows ?? []).filter((r) => r.status !== "skipped" && r.status !== "alreadyIn" && outside(r)).length;

  const header = { title: "Import from Splitwise", back: true } as const;
  // The file is read by the server, so every step needs it.
  const chooseGate = useOnlineGate("Choose the CSV file");
  const reviewGate = useOnlineGate("Review the rows");
  const approveGate = useOnlineGate(`Approve ${count(approving, "row")}`);

  if (tripGone) {
    return (
      <ScreenScaffold {...header}>
        <NotFoundState thing="trip" />
      </ScreenScaffold>
    );
  }

  // ---- Step 1: pick the file ----
  if (!csv) {
    return (
      <ScreenScaffold {...header}>
        <Card style={styles.card}>
          <Icon name="download" size={22} container="square" containerSize={48} containerRadius={16} gradient="teal" />
          <AppText size="md" weight="black">Bring in what your friends logged</AppText>
          <AppText size="sm" color="inkDim" style={styles.lh}>
            In Splitwise, open the group → settings → Export as spreadsheet, and save the CSV. Then choose it here. You'll review every row before anything is added — and importing the same file later only adds what's new.
          </AppText>
          <Button label={chooseGate.label} icon={chooseGate.icon} hint={chooseGate.hint} disabled={!chooseGate.allowed} loading={busy} onPress={pick} />
        </Card>
        <FormError message={error} />
        <AppText size="xs" color="inkDim" style={styles.lh}>
          If the file won't read, you can still add each shared expense from the trip with "Expense" — who paid, and who it's split between.
        </AppText>
      </ScreenScaffold>
    );
  }

  // ---- Step 2: who's who ----
  if (!rows) {
    return (
      <ScreenScaffold {...header}>
        <AppText size="sm" color="inkDim" style={styles.lh}>Match each name in the file once. New people are added to the trip.</AppText>
        <Card style={styles.list}>
          {names.map((n) => {
            const v = mapping[n];
            return (
              <View key={n} style={styles.nameRow}>
                {/* The file's name on its own line, whole, so it can be told apart from the chips. */}
                <AppText size="sm" weight="bold" numberOfLines={1}>{n}</AppText>
                <View style={styles.chipRow}>
                <Chip label="Me" accessibilityLabel={`${n} is me`} selected={v === "me"} onPress={() => setMapping((m) => ({ ...Object.fromEntries(Object.entries(m).map(([k, x]) => [k, x === "me" ? "new" : x])), [n]: "me" }))} />
                {/* A fixed slot, so picking a long name doesn't push the other chips about. */}
                <View style={styles.personSlot}>
                  <Chip
                    grow
                    singleLine
                    label={v && v !== "me" && v !== "new" ? accountName(v) ?? "Person" : "Person ▾"}
                    selected={!!v && v !== "me" && v !== "new"}
                    accessibilityLabel={v && v !== "me" && v !== "new" ? `${n} is ${accountName(v) ?? "a person"}` : `Pick who ${n} is`}
                    onPress={() => { setPersonFor(n); personRef.current?.present(); }}
                  />
                </View>
                <Chip label="New" accessibilityLabel={`${n} is a new person`} selected={v === "new"} onPress={() => setMapping((m) => ({ ...m, [n]: "new" }))} />
                </View>
              </View>
            );
          })}
        </Card>
        <FormError message={error} />
        <Button label={reviewGate.label} icon={reviewGate.icon} hint={reviewGate.hint} disabled={!reviewGate.allowed} loading={busy} onPress={review} />
        <AccountPickerSheet ref={personRef} title="Who is this?" filterType="person" onPick={(acc) => { if (personFor) setMapping((m) => ({ ...m, [personFor]: acc })); }} />
      </ScreenScaffold>
    );
  }

  // ---- Step 3: review ----
  return (
    <ScreenScaffold {...header}>
      {summary && (
        <Card style={styles.summary}>
          <View style={styles.grow}>
            <Caps>Your share from this file</Caps>
            <Money value={summary.myShare} size="lg" weight="black" />
          </View>
          <View style={styles.right}>
            <AppText size="xs" color="inkDim">{count(rows.length, "row")}</AppText>
            <AppText size="xs" weight="bold" color={summary.matchesFile ? "success" : "warning"}>
              {summary.matchesFile ? "matches Splitwise ✓" : `Splitwise says ${formatMoney(summary.fileBalance ?? 0)}`}
            </AppText>
          </View>
        </Card>
      )}

      {trip && outsideCount > 0 && (
        <Card style={styles.warn}>
          <AppText size="xs" weight="bold" color="warning">
            {count(outsideCount, "row")} {outsideCount === 1 ? "falls" : "fall"} outside {trip.name}'s dates ({formatSpan(new Date(trip.startDate), new Date(trip.endDate))})
          </AppText>
          <AppText size="xs" color="inkDim">Check this is the right trip's file. If it is, they're added on their own dates.</AppText>
        </Card>
      )}

      {needsYou.length > 0 && (
        <>
          <Caps header color="warning">Needs you · {needsYou.length}</Caps>
          <Card style={styles.list}>
            {needsYou.map((r) => {
              const c = choices[r.key];
              const tag = STATUS_TAG[r.status];
              return (
                <View key={r.key} style={styles.reviewRow}>
                  <View style={styles.rowTop}>
                    <Badge size="sm" tone={tag.tone} label={tag.label} />
                    <View style={styles.grow} />
                    <Money value={r.status === "settlement" ? r.cost : r.myShare || r.cost} size="sm" weight="bold" color={r.status === "settlement" ? "success" : "ink"} />
                  </View>
                  <AppText size="sm" weight="bold" numberOfLines={1}>{r.title} <AppText size="xs" color={outside(r) ? "warning" : "inkDim"}>· {rowDay(r.date)}</AppText></AppText>
                  {r.status === "matchesYours" && (
                    <>
                      <AppText size="xs" color="inkDim">Looks like {r.matches?.length === 1 ? `your "${r.matches[0].title}"` : `${r.matches?.length} things you logged`} · apply this split, keeping your detail</AppText>
                      <View style={styles.inlineRow}><AppText size="xs" color="inkSecondary" style={styles.grow}>Apply the split</AppText><Toggle label={`Apply the split to ${r.title}`} value={c.include} onValueChange={(v) => setChoice(r.key, { include: v })} /></View>
                    </>
                  )}
                  {r.status === "lump" && (
                    <PressableScale onPress={() => { setTarget(r.key); breakdownRef.current?.present(); }} scaleTo={0.98} accessibilityLabel={c.parts ? `${r.title}, broken into ${count(c.parts.length, "part")}` : `Break down ${r.title}`}>
                      <AppText size="xs" weight="bold" color="primary">
                        {c.parts ? `Broken into ${c.parts.length} parts ›` : `Break it down · or keep as one${c.category ? ` (${catName(c.category)})` : ""} ›`}
                      </AppText>
                    </PressableScale>
                  )}
                  {(r.status === "settlement" || r.status === "pickAccount" || (r.status === "isThisYours" && c.include)) && (
                    <PressableScale onPress={() => { setTarget(r.key); accountRef.current?.present(); }} scaleTo={0.98} accessibilityLabel={`${r.status === "settlement" && r.direction === "received" ? "Received into" : "Paid from"} ${accountName(c.account) ?? "no account yet"}`} accessibilityHint="Picks the account">
                      <AppText size="xs" color="inkDim">
                        {r.status === "settlement" ? (r.direction === "received" ? "Received into " : "Paid from ") : "Paid from "}
                        <AppText size="xs" weight="bold" color="primary">{accountName(c.account) ?? "choose ▾"}</AppText>
                      </AppText>
                    </PressableScale>
                  )}
                  {r.status === "isThisYours" && (
                    <View style={styles.inlineRow}><AppText size="xs" color="inkDim" style={styles.grow}>Doesn't affect anyone's balance — add it as yours?</AppText><Toggle label={`Add ${r.title} as yours`} value={c.include} onValueChange={(v) => setChoice(r.key, { include: v })} /></View>
                  )}
                  {(r.status === "pickAccount" || r.status === "lump" || (r.status === "isThisYours" && c.include)) && !c.parts && (
                    <PressableScale onPress={() => { setTarget(r.key); categoryRef.current?.present(); }} scaleTo={0.98} accessibilityLabel={`Category, ${catName(c.category) ?? "none yet"}`} accessibilityHint="Picks the category">
                      <AppText size="xs" color="inkDim">Category <AppText size="xs" weight="bold" color={c.category ? "ink" : "primary"}>{catName(c.category) ?? "choose ▾"}</AppText></AppText>
                    </PressableScale>
                  )}
                </View>
              );
            })}
          </Card>
        </>
      )}

      {ready.length > 0 && (
        <>
          <Caps header color="success">Ready · {ready.length}</Caps>
          <Card style={styles.list}>
            {ready.map((r) => {
              const c = choices[r.key];
              return (
                <View key={r.key} style={styles.readyRow}>
                  <View style={styles.grow}>
                    <AppText size="sm" weight="bold" numberOfLines={1} color={c.include ? "ink" : "inkDim"}>{r.title}</AppText>
                    <PressableScale onPress={() => { setTarget(r.key); categoryRef.current?.present(); }} scaleTo={0.98} accessibilityLabel={`${r.title}, category ${catName(c.category) ?? "none yet"}, ${rowDay(r.date)}`} accessibilityHint="Picks the category">
                      <AppText size="xs" color={c.category ? "inkDim" : "primary"}>{catName(c.category) ?? "Choose a category ▾"} · <AppText size="xs" color={outside(r) ? "warning" : "inkDim"}>{rowDay(r.date)}</AppText></AppText>
                    </PressableScale>
                  </View>
                  <Money value={r.myShare} size="sm" weight="bold" color={c.include ? "ink" : "inkDim"} />
                  <Toggle label={`Import ${r.title}`} value={c.include} onValueChange={(v) => setChoice(r.key, { include: v })} />
                </View>
              );
            })}
          </Card>
        </>
      )}

      {skipped.length > 0 && (
        <PressableScale onPress={() => setShowSkipped((s) => !s)} scaleTo={0.99} accessibilityState={{ expanded: showSkipped }}>
          <AppText size="xs" color="inkDim">Skipped · {skipped.length} — already in, not yours, or between others {showSkipped ? "▾" : "›"}</AppText>
        </PressableScale>
      )}
      {showSkipped && (
        <Card style={styles.list}>
          {skipped.map((r) => (
            <View key={r.key} style={styles.readyRow}>
              <View style={styles.grow}>
                <AppText size="sm" color="inkDim" numberOfLines={1}>{r.title}</AppText>
                <AppText size="xs" color="inkDim">{r.status === "alreadyIn" ? "Already imported" : r.reason}</AppText>
              </View>
              <Money value={r.cost} size="sm" color="inkDim" />
            </View>
          ))}
        </Card>
      )}

      <FormError message={error} />
      <Button label={approveGate.label} icon={approveGate.icon} hint={approveGate.hint} loading={busy} disabled={!approveGate.allowed || approving === 0} onPress={approve} />
      {/* Rows are saved one by one (each moves balances the next one reads), so a long file
          takes a while — say so rather than leave a bare spinner. */}
      {busy && (
        <AppText size="xs" color="inkDim" style={styles.center}>
          Adding {count(approving, "row")} to {trip?.name ?? "the trip"} — a big file takes a few seconds. Keep this screen open.
        </AppText>
      )}

      <CategoryPickerSheet ref={categoryRef} kind="expense" onPick={(cid) => { if (target) setChoice(target, { category: cid }); }} />
      <AccountPickerSheet ref={accountRef} title="Which account?" selectedId={target ? choices[target]?.account : null} onPick={(aid) => { if (target) setChoice(target, { account: aid }); }} excludeTypes={["investment", "person"]} />
      <BreakdownSheet ref={breakdownRef} row={targetRow} initial={target ? choices[target]?.parts ?? null : null} onSave={(parts) => { if (target) setChoice(target, { parts }); }} />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  right: { alignItems: "flex-end" },
  lh: { lineHeight: 19 },
  center: { textAlign: "center" },
  card: { gap: spacing.md },
  list: { paddingVertical: 2 },
  summary: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  warn: { gap: 4, borderColor: colors.warning },
  personSlot: { flex: 1, flexDirection: "row" },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  nameRow: { gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  reviewRow: { gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  rowTop: { flexDirection: "row", alignItems: "center" },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  readyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
});

export default TripImportScreen;
