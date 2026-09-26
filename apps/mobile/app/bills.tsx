import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { IBill, RecurringPattern } from "@save-n-spend/types";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import BillRow from "@/components/rows/BillRow";
import { AppText } from "@/components/ui/AppText";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import MarkPaidSheet from "@/components/sheets/MarkPaidSheet";
import EditBillSheet, { type BillDraft } from "@/components/sheets/EditBillSheet";
import RecurringSuggestionsSheet from "@/components/sheets/RecurringSuggestionsSheet";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import ConfirmSheet from "@/components/sheets/ConfirmSheet";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { useBills, groupBills, outstandingTotal, isActionable, deleteBill } from "@/lib/bills";
import { bulkConvertToInvestment, dismissRecurring, useRecurringSuggestions } from "@/lib/recurring";
import { useAccountById } from "@/lib/accounts";
import { startOfToday } from "@/lib/date";
import { toast } from "@/store/toast";
import { pendingDeletes, usePendingDeletes } from "@/store/pendingDeletes";
import { radius, spacing } from "@/theme";

type SectionProps = {
  label: string;
  bills: IBill[];
  onPick: (bill: IBill) => void;
  onEdit: (bill: IBill) => void;
  onDelete: (bill: IBill) => void;
};

const Section = ({ label, bills, onPick, onEdit, onDelete }: SectionProps) => {
  if (bills.length === 0) return null;
  return (
    <View style={styles.section}>
      <AppText size="xs" weight="bold" color="inkDim" style={styles.sectionLabel}>
        {label}
      </AppText>
      {bills.map((bill) => (
        // Every row is editable and deletable, including a paid one: a wrong amount is
        // worth correcting for next cycle, and the row body's own action is what a paid
        // bill has nothing left of.
        <Animated.View key={bill._id} layout={LinearTransition.duration(220)}>
          <BillRow
            bill={bill}
            onPress={isActionable(bill) ? () => onPick(bill) : undefined}
            onEdit={() => onEdit(bill)}
            onDelete={() => onDelete(bill)}
          />
        </Animated.View>
      ))}
    </View>
  );
};

const BillsScreen = () => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  const { items: allItems, loading, error, refetch } = useBills();
  // Hidden the instant delete is confirmed — the real DELETE only fires if the undo
  // grace window elapses undisturbed (see store/pendingDeletes.ts).
  const pendingKeys = usePendingDeletes((s) => s.keys);
  const items = allItems.filter((b) => !pendingKeys.has(`bill:${b._id}`));

  const markRef = useRef<BottomSheetModal>(null);
  const editRef = useRef<BottomSheetModal>(null);
  const deleteRef = useRef<BottomSheetModal>(null);
  // Three separate targets, not one "selected bill": the delete confirm has to keep
  // naming its bill while the editor for another is being opened behind it.
  const [active, setActive] = useState<IBill | null>(null);
  const [editing, setEditing] = useState<IBill | null>(null);
  const [removing, setRemoving] = useState<IBill | null>(null);

  const { data: suggestions, refetch: refetchSuggestions } = useRecurringSuggestions();
  const suggestionsRef = useRef<BottomSheetModal>(null);
  const convertRef = useRef<BottomSheetModal>(null);
  const [draft, setDraft] = useState<BillDraft | null>(null);
  const [draftPattern, setDraftPattern] = useState<RecurringPattern | null>(null);
  // A SIP just set up from a suggestion, whose past payments can be moved into the holding.
  const [convert, setConvert] = useState<{ pattern: RecurringPattern; toInvestment: string } | null>(null);
  const convertHolding = useAccountById(convert?.toInvestment ?? null);

  useFocusEffect(useCallback(() => {
    refetch();
    void refetchSuggestions();
  }, [refetch, refetchSuggestions]));

  // Arriving from the "payments look like they repeat" notification opens the review list.
  const { suggestions: openSuggestions } = useLocalSearchParams<{ suggestions?: string }>();
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (openSuggestions === "1" && !autoOpened && suggestions.expenses.length > 0) {
      setAutoOpened(true);
      suggestionsRef.current?.present();
    }
  }, [openSuggestions, autoOpened, suggestions.expenses.length]);

  const addFromSuggestion = (pattern: RecurringPattern) => {
    // Next due is a month after the last payment — or today, if that's already passed and
    // this cycle hasn't been paid yet.
    const next = new Date(pattern.nextExpectedAt);
    const today = startOfToday();
    setDraftPattern(pattern);
    setDraft({
      name: pattern.title,
      amount: pattern.amount,
      category: pattern.category,
      account: pattern.account,
      dueDate: next < today ? today : next,
      fundsInvestment: pattern.looksLikeSip,
    });
    setEditing(null);
    editRef.current?.present();
  };

  const dismissSuggestion = async (pattern: RecurringPattern) => {
    try {
      await dismissRecurring(pattern.key);
      await refetchSuggestions();
      toast.info(`Won't suggest ${pattern.title} again`);
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't dismiss that");
    }
  };

  const afterSave = (bill: IBill) => {
    void refetchSuggestions();
    const pattern = draftPattern;
    setDraft(null);
    setDraftPattern(null);
    // Set up as a SIP from a suggestion, with past payments still logged as spending —
    // offer to move them into the holding too.
    if (pattern && bill.toInvestment && pattern.transactionIds.length > 0) {
      setConvert({ pattern, toInvestment: bill.toInvestment });
      convertRef.current?.present();
    }
  };

  const onPick = (bill: IBill) => {
    setActive(bill);
    markRef.current?.present();
  };

  const onEdit = (bill: IBill) => {
    setEditing(bill);
    editRef.current?.present();
  };

  const onDelete = (bill: IBill) => {
    setRemoving(bill);
    deleteRef.current?.present();
  };

  // `null` first: the same sheet edits, so a stale target would open it on the last
  // bill that was edited.
  const openAdd = () => {
    setEditing(null);
    setDraft(null);
    setDraftPattern(null);
    editRef.current?.present();
  };

  const suggestionCount = suggestions.expenses.length;
  const suggestionBanner = suggestionCount > 0 && (
    <PressableScale
      onPress={() => suggestionsRef.current?.present()}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${suggestionCount} recurring payment${suggestionCount === 1 ? "" : "s"} found. Review.`}
    >
      <Card style={styles.suggest}>
        <Icon name="repeat" size={18} container="square" containerSize={40} containerRadius={13} gradient="blue" />
        <View style={styles.suggestText}>
          <AppText size="sm" weight="bold">
            {suggestionCount === 1
              ? `${suggestions.expenses[0].title} looks like it repeats`
              : `We found ${suggestionCount} recurring payments`}
          </AppText>
          <AppText size="xs" color="inkDim">Review and turn them into bills</AppText>
        </View>
        <Icon name="chevronRight" size={20} color="inkDim" />
      </Card>
    </PressableScale>
  );

  const headerRight = <Button label="+ Add Bill" pill size="sm" onPress={openAdd} />;

  if (error) {
    return (
      <ScreenScaffold title="Bills" headerRight={headerRight}>
        <ErrorState message={error} onRetry={refetch} />
      </ScreenScaffold>
    );
  }

  if (loading && items.length === 0) {
    return (
      <ScreenScaffold title="Bills" headerRight={headerRight}>
        <View style={styles.skeletonCol}>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonState key={i} height={72} borderRadius={radius.lg} />
          ))}
        </View>
      </ScreenScaffold>
    );
  }

  const groups = groupBills(items);
  const { total, pending, overdue } = outstandingTotal(items);

  return (
    <ScreenScaffold title="Bills" headerRight={headerRight}>
      {suggestionBanner}
      {items.length === 0 ? (
        <EmptyState
          icon="bills"
          title="No bills yet"
          subtitle="Add a recurring bill and never miss a due date."
          actionLabel="Add a bill"
          onAction={openAdd}
        />
      ) : (
        <>
          <Card style={styles.strip}>
            <AppText size="xs" weight="bold" color="inkDim" style={styles.sectionLabel}>
              OUTSTANDING THIS MONTH
            </AppText>
            <AppText size="2xl" weight="black">
              {formatMoney(total)}
            </AppText>
            <View style={styles.counts}>
              <Badge label={`${pending} pending`} status="pending" size="sm" />
              {overdue > 0 && <Badge label={`${overdue} overdue`} status="overdue" size="sm" />}
            </View>
          </Card>

          <Section label="OVERDUE" bills={groups.overdue} onPick={onPick} onEdit={onEdit} onDelete={onDelete} />
          <Section label="UPCOMING" bills={groups.upcoming} onPick={onPick} onEdit={onEdit} onDelete={onDelete} />
          <Section label="PAID THIS MONTH" bills={groups.paid} onPick={onPick} onEdit={onEdit} onDelete={onDelete} />
        </>
      )}

      <MarkPaidSheet ref={markRef} bill={active} onChanged={refetch} />
      <EditBillSheet ref={editRef} bill={editing} draft={draft} onChanged={refetch} onSaved={afterSave} />
      <RecurringSuggestionsSheet
        ref={suggestionsRef}
        suggestions={suggestions.expenses}
        onAdd={addFromSuggestion}
        onDismiss={dismissSuggestion}
      />
      <ConfirmSheet
        ref={convertRef}
        icon="investments"
        tone="primary"
        title={`Move ${convert?.pattern.transactionIds.length ?? 0} past payments into ${convertHolding?.name ?? "the holding"}?`}
        body="They're logged as spending right now. Moving them makes them contributions to this holding, so your spending drops and the holding's invested amount goes up. Your bank balance doesn't change."
        confirmLabel="Move them"
        cancelLabel="Not now"
        onConfirm={async () => {
          if (!convert) return;
          const moved = await bulkConvertToInvestment(convert.pattern.transactionIds, convert.toInvestment);
          toast.success(`${moved} payment${moved === 1 ? "" : "s"} moved to ${convertHolding?.name ?? "the holding"}`);
          setConvert(null);
        }}
      />

      <ConfirmSheet
        ref={deleteRef}
        icon="delete"
        title={`Delete ${removing?.name ?? "bill"}?`}
        // Says what survives, because a bill that has been paid before looks like it is
        // holding that history: it isn't. The payments are transactions in their own right.
        body="The reminder stops and the bill leaves this list. Any payment you already recorded stays in your transactions, so your balances and totals don't move."
        confirmLabel="Delete bill"
        onConfirm={() => {
          if (!removing) return;
          const key = `bill:${removing._id}`;
          const name = removing.name;
          pendingDeletes.schedule(key, name, async () => {
            await deleteBill(removing._id);
            refetch();
          });
          toast.action("info", `${name} deleted`, {
            label: "Undo",
            onPress: () => pendingDeletes.cancel(key),
          });
        }}
      />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  strip: {
    gap: spacing.sm,
  },
  suggest: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  suggestText: {
    flex: 1,
    gap: 2,
  },
  counts: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  section: {
    gap: spacing.md,
  },
  sectionLabel: {
    letterSpacing: 1.3,
  },
  skeletonCol: {
    gap: spacing.lg,
  },
});

export default BillsScreen;
