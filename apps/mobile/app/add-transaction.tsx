import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useLocalSearchParams } from "expo-router";
import { goBackOrHome } from "@/lib/navigation";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import Caps from "@/components/ui/Caps";
import CategoryName from "@/components/ui/CategoryName";
import DateField from "@/components/ui/DateField";
import ErrorState from "@/components/states/ErrorState";
import NotFoundState from "@/components/states/NotFoundState";
import SkeletonState from "@/components/states/SkeletonState";
import { ListSkeleton } from "@/components/states/ScreenStates";
import { haptics } from "@/lib/haptics";
import { toast } from "@/store/toast";
import { z } from "zod/v4";
import formatMoney, { formatBalance, paiseToInput, parseMoney, usePrivacyMask } from "@/lib/money";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Input from "@/components/ui/Input";
import GhostTitleInput from "@/components/ui/GhostTitleInput";
import Button from "@/components/ui/Button";
import { useCategories, useCategoryById, useCategoryLabel } from "@/lib/categories";
import SegmentedControl from "@/components/ui/SegmentedControl";
import CategoryPickerSheet from "@/components/sheets/CategoryPickerSheet";
import type { IconName } from "@/lib/icons";
import { radius, spacing } from "@/theme";
import type { ColorToken } from "@/theme";
import { accountById, useAccountById, useAccounts, useDefaultAccount } from "@/lib/accounts";
import AccountPickerSheet from "@/components/sheets/AccountPickerSheet";
import RevalueSheet from "@/components/sheets/RevalueSheet";
import { useInvestments } from "@/lib/investments";
import { ApiError, get, getFetched, patch, post } from "@/lib/api";
import { splitIssues, errorText } from "@/lib/apiError";
import { useIdempotencyKey } from "@/lib/useIdempotencyKey";
import { holderFor } from "@/lib/idempotency";
import { useOnlineGate } from "@/lib/onlineGate";
import { useAccountStore } from "@/store/accounts";
import { useTitleSuggestionStore } from "@/store/titleSuggestions";
import { useTitleMatches } from "@/lib/titleSuggestions";
import { useOutbox } from "@/store/outbox";
import type { ITransaction } from "@save-n-spend/types";
import { editUndoAllowed, editWithUndo, previousValues } from "@/lib/undo";
import FormError from "@/components/ui/FormError";

const schema = z.object({
  title: z.string(),
  amount: z
    .string()
    .regex(/^\s*₹?\s*[\d,]+(\.\d{1,2})?\s*$/, "Enter a valid amount")
    .refine((v) => parseMoney(v) > 0, "Enter a valid amount"),
  // "invest" is a UI mode, not a stored type — it posts as a transfer whose destination
  // is an investment account (see onSubmit). It behaves exactly like transfer here.
  type: z.enum(["income", "expense", "transfer", "invest"]),
  // The picker only renders real categories (kind-filtered), so a non-empty
  // selection is a valid one; the server is the source of truth on save.
  category: z.string(),
  note: z.string(),
  location: z.string(),
}).superRefine((data, ctx) => {
  // A transfer/invest moves money between accounts — it has no title or category.
  // Spends (income/expense) require both.
  if (data.type !== "transfer" && data.type !== "invest") {
    if (data.title.trim().length === 0) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "Title is required" });
    }
    if (data.category.length === 0) {
      ctx.addIssue({ code: "custom", path: ["category"], message: "Select a category" });
    }
  }
});

type FormValues = z.infer<typeof schema>

// Indian digit grouping for the hero display: last 3, then pairs (12,34,567).
const groupINR = (digits: string): string => {
  if (digits.length <= 3) return digits;
  const parts: string[] = [digits.slice(-3)];
  let rest = digits.slice(0, -3);
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return parts.join(",");
};

const formatAmountDisplay = (raw: string): string => {
  if (!raw) return "0";
  const [int = "", dec] = raw.split(".");
  const grouped = groupINR(int) || "0";
  return dec !== undefined ? `${grouped}.${dec}` : grouped;
};

// Spec numpad — digits stream straight into the hero figure; no boxed input.
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

const TYPE_SEGMENTS: { key: FormValues["type"]; label: string }[] = [
  { key: "expense", label: "Expense" },
  { key: "income", label: "Income" },
  { key: "transfer", label: "Transfer" },
  { key: "invest", label: "Invest" },
];

// Deliberately not the shared Chip: that one carries a gradient glow built for a fixed,
// persistent choice set (Bank/Cash/Wallet). This row is a scrollable, ever-changing
// shortlist the user skims and taps once — the same glass-strip weight as a plain field,
// not a selector. Carries the suggestion's own category icon/colour, so a chip is
// recognisable before it's read — the same visual language every category already
// wears everywhere else in the app.
const SuggestionChip = ({
  label,
  icon,
  color,
  onPress,
}: {
  label: string;
  icon: IconName;
  color: ColorToken;
  onPress: () => void;
}) => (
  // Labelled by hand: left to itself VoiceOver joins the icon's empty part in (", Big Basket").
  <PressableScale style={styles.suggestionChip} onPress={onPress} scaleTo={0.95} accessibilityLabel={label} accessibilityHint="Fills in this title and its category.">
    <Icon name={icon} size={11} containerSize={20} containerRadius={7} container="square" gradient={color} />
    <AppText size="sm" weight="semibold" numberOfLines={1}>
      {label}
    </AppText>
  </PressableScale>
);

const AddTransaction = () => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  const { id, repeatId, settleAccount, draftFrom, mode, redeemFrom } = useLocalSearchParams<{ id?: string; repeatId?: string; settleAccount?: string; draftFrom?: string; mode?: string; redeemFrom?: string }>();
  const isEdit = !!id;

  const categories = useCategories();
  const { control, handleSubmit, watch, setValue, reset, setError, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", amount: "", category: "", type: "expense", note: "", location: "" }
  })
  const mountKeys = useIdempotencyKey();
  // A new entry starts blank (and dated now), so its key lives with this mount. An edit, or a
  // failed queued entry being fixed, reopens with the same values, so its key outlives the screen.
  const idem = id ? holderFor(`transaction:${id}`) : draftFrom ? holderFor(`transaction:draft:${draftFrom}`) : mountKeys;

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [occurredAt, setOccurredAt] = useState<Date>(new Date());
  const [extrasOpen, setExtrasOpen] = useState(false);
  // An edit whose transaction couldn't be read: the blank form must not be saved over it.
  const [editLoad, setEditLoad] = useState<{ notFound: boolean; message: string } | null>(null);
  const [editAttempt, setEditAttempt] = useState(0);
  // When the transaction being edited was fetched; null until it has loaded, so the form
  // (and its Save) stays hidden behind a skeleton rather than offering a blank record.
  const [editFetchedAt, setEditFetchedAt] = useState<number | null>(null);
  // The record as loaded, so "Changes saved · Undo" can send its old values back.
  const [editOriginal, setEditOriginal] = useState<ITransaction | null>(null);

  // Shared by editing a transaction and repeating one — everything is the same except
  // which moment it lands on: the original's own timestamp for an edit, right now for a
  // repeat. That's the one thing callers pass in.
  const applyTransactionToForm = (transaction: ITransaction, landOn: Date) => {
    reset({
      title: transaction.title ?? "",
      amount: paiseToInput(transaction.amount),
      type: transaction.type as FormValues["type"],
      category: transaction.category ?? "",
      note: transaction.note ?? "",
      location: transaction.location ?? "",
    });
    setOccurredAt(landOn);
    setAccountId(transaction.account ?? null);
    setToAccountId(transaction.toAccount ?? null);
    if (transaction.note || transaction.location) setExtrasOpen(true);
  };

  useEffect(() => {
    if (!id) {
      return;
    }

    (async () => {
      try {
        const { data: transaction, fetchedAt } = await getFetched<ITransaction>(`/transactions/${id}`);
        applyTransactionToForm(transaction, transaction.occurredAt ? new Date(transaction.occurredAt) : new Date());
        setEditOriginal(transaction);
        setEditFetchedAt(fetchedAt);
      }
      catch (err) {
        haptics.error();
        setEditLoad({
          notFound: err instanceof ApiError && err.status === 404,
          message: errorText(err, "Couldn't load transaction"),
        });
      }
    })();
  }, [id, reset, editAttempt])

  // "Log again today" from the detail sheet — the same load as editing, except it lands on
  // now rather than the original's moment, and `isEdit` stays false (keyed to `id` alone) so
  // the form opens fully editable rather than locked the way an edit is.
  useEffect(() => {
    if (!repeatId) {
      return;
    }

    (async () => {
      try {
        const transaction = await get<ITransaction>(`/transactions/${repeatId}`);
        applyTransactionToForm(transaction, new Date());
      }
      catch (err) {
        haptics.error();
        setSubmitError(errorText(err, "Couldn't load that transaction"));
      }
    })();
  }, [repeatId, reset])

  // "Edit as new draft" from a failed outbox row — the same prefill as editing, but the
  // source is the queued payload sitting on the phone rather than a fetch, since the
  // server never actually has this one. Resaving or requeuing discards the original
  // (see onSubmit) rather than leaving two copies of the same attempt around.
  useEffect(() => {
    if (!draftFrom) return;
    const item = useOutbox.getState().items.find((i) => i.clientId === draftFrom);
    if (!item) return;
    const p = item.payload as Record<string, unknown>;
    reset({
      title: (p.title as string | undefined) ?? "",
      amount: paiseToInput((p.amount as number | undefined) ?? 0),
      type: (p.type as FormValues["type"] | undefined) ?? "expense",
      category: (p.category as string | undefined) ?? "",
      note: (p.note as string | undefined) ?? "",
      location: (p.location as string | undefined) ?? "",
    });
    if (p.occurredAt) setOccurredAt(new Date(p.occurredAt as string));
    setAccountId((p.account as string | undefined) ?? null);
    setToAccountId((p.toAccount as string | undefined) ?? null);
    if (p.note || p.location) setExtrasOpen(true);
  }, [draftFrom, reset])

  // Deep-linked "+ Invest" from the Investments hub opens straight in invest mode.
  useEffect(() => {
    if (mode === "invest" && !id) setValue("type", "invest");
  }, [mode, id, setValue]);

  // Spec: the CTA label is live — it names what you're saving.
  const type = watch("type");
  const amountRaw = watch("amount");
  // Transfer and invest are the same money move (account → account); invest just filters
  // the destination to investment accounts and posts as a transfer. This flag folds the
  // two together everywhere the flow is identical.
  const isMoveType = type === "transfer" || type === "invest";

  // Category — picked via the shared sheet (search + create on the fly), same as Bills/Budgets.
  const categoryRef = useRef<BottomSheetModal>(null);
  const selectedCategory = useCategoryById(watch("category"));
  const selectedCategoryLabel = useCategoryLabel(watch("category"));

  // Title autosuggest — ranked by how often this account has used a title, scoped to this
  // category once one is picked. Hooks run every render regardless of `type`, so a
  // transfer (which never shows this row) still calls it with "expense" rather than
  // skipping the call, which React does not allow to be conditional.
  const titleMatches = useTitleMatches(
    type === "income" ? "income" : "expense",
    watch("category"),
    watch("title"),
  );

  // The one match ghost-completed inside the field itself — a PREFIX match only, since
  // there's no way to visually "complete" a title from a match found in its middle. The
  // strip below still shows every match `useTitleMatches` found, prefix or not, so
  // nothing found only by substring is lost — it just doesn't get ghosted.
  const titleValue = watch("title");
  const ghostMatch = useMemo(() => {
    const needle = titleValue.trim().toLowerCase();
    if (!needle) return null;
    return titleMatches.find((m) => m.title.toLowerCase().startsWith(needle)) ?? null;
  }, [titleMatches, titleValue]);
  const ghostSuffix = ghostMatch ? ghostMatch.title.slice(titleValue.length) : null;

  // Shared by the ghost's accept (swipe or tap) and every chip in the strip below, so
  // "pick a title" means the same thing everywhere it can happen.
  const acceptTitleSuggestion = (match: { title: string; category: string | null }) => {
    setValue("title", match.title, { shouldValidate: true });
    // The inversion the feature is really for: pick a title before a category and get
    // the category for free. Never overwrites one the user has already chosen.
    if (!watch("category") && match.category) {
      setValue("category", match.category, { shouldValidate: true });
    }
  };

  // Source account (from) — defaults to the user's default, switchable via the picker.
  const accountRef = useRef<BottomSheetModal>(null);
  const defaultAccount = useDefaultAccount();
  const [accountId, setAccountId] = useState<string | null>(null);
  useEffect(() => {
    if (!accountId && defaultAccount) setAccountId(defaultAccount._id);
  }, [defaultAccount, accountId]);
  const account = useAccountById(accountId) ?? defaultAccount;

  // Destination account (transfer only) — must be picked, and different from the source.
  const toAccountRef = useRef<BottomSheetModal>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const toAccount = useAccountById(toAccountId);

  // "Redeem" from a holding's detail — a transfer OUT of the investment, source preset,
  // destination defaulting to the user's default account. It's a transfer under the hood,
  // same as invest; only the source being an investment makes it read as a redemption.
  const isRedeem = type === "transfer" && account?.type === "investment";
  useEffect(() => {
    if (!redeemFrom || id) return;
    setValue("type", "transfer");
    setAccountId(redeemFrom);
    setToAccountId(defaultAccount?._id ?? null);
  }, [redeemFrom, id, setValue, defaultAccount]);

  // Redeeming books at the holding's recorded value, which is only as fresh as the last
  // update — so redeem mode offers "update value first" (see the row below). Fetched only
  // when arriving to redeem, since a plain expense has no use for it.
  const revalueRef = useRef<BottomSheetModal>(null);
  const { data: investmentsData } = useInvestments(!!redeemFrom);
  const redeemHolding = investmentsData?.holdings.find((h) => h.accountId === account?._id) ?? null;

  // "Settle up" from a person account's sheet — a transfer prefilled in whichever direction
  // clears the balance, amount included. Nothing is locked: the real repayment can differ
  // slightly (rounding, a partial settlement), so every field stays editable.
  useEffect(() => {
    if (!settleAccount) {
      return;
    }
    const person = accountById(settleAccount);
    if (!person) {
      return;
    }
    const owesYou = person.balance > 0;
    setValue("type", "transfer");
    setAccountId(owesYou ? person._id : (defaultAccount?._id ?? null));
    setToAccountId(owesYou ? (defaultAccount?._id ?? null) : person._id);
    setValue("amount", paiseToInput(Math.abs(person.balance)));
  }, [settleAccount, setValue, defaultAccount])

  // For the split rows below: `useAccountById` is a hook and can't be called once per row
  // in a `.map`, so the whole list is subscribed once here and each row does a plain lookup.
  const allAccounts = useAccounts();

  // Split — expense only, new entries only (an edit can't reconcile a group's transfers).
  // Each row picks a person and what they owe; the rest of the total stays the user's own
  // share. `key` is local-only, for React's list identity — it never reaches the server.
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitRows, setSplitRows] = useState<{ key: string; accountId: string | null; amount: string }[]>([]);
  const nextRowKey = useRef(0);
  const [activeSplitKey, setActiveSplitKey] = useState<string | null>(null);
  const splitAccountRef = useRef<BottomSheetModal>(null);

  const addSplitRow = () => {
    if (splitRows.length >= 10) return; // matches the API's per-split cap
    setSplitRows((rows) => [...rows, { key: String(nextRowKey.current++), accountId: null, amount: "" }]);
  };

  const toggleSplit = () => {
    setSplitOpen((open) => {
      const next = !open;
      if (next && splitRows.length === 0) addSplitRow();
      return next;
    });
  };

  const removeSplitRow = (key: string) => {
    haptics.tap();
    setSplitRows((rows) => rows.filter((r) => r.key !== key));
  };

  const setSplitAmount = (key: string, amount: string) =>
    setSplitRows((rows) => rows.map((r) => (r.key === key ? { ...r, amount } : r)));

  // Only rows with a person picked count — an empty row is a slot still being filled in.
  const splitFilledRows = splitOpen ? splitRows.filter((r) => r.accountId) : [];
  const owedTotal = splitFilledRows.reduce((sum, r) => {
    const rowAmount = parseMoney(r.amount);
    return sum + (Number.isFinite(rowAmount) && rowAmount > 0 ? rowAmount : 0);
  }, 0);

  const splitEqually = () => {
    if (splitFilledRows.length === 0 || !(entered > 0)) return;
    haptics.toggle();
    // Rounds down; the remainder stays in the user's own share rather than vanishing —
    // see the share computation in onSubmit, which is `entered` minus this same sum.
    const perPerson = Math.floor(entered / (splitFilledRows.length + 1));
    const perPersonInput = paiseToInput(perPerson);
    setSplitRows((rows) => rows.map((r) => (r.accountId ? { ...r, amount: perPersonInput } : r)));
  };

  const entered = parseMoney(amountRaw);
  const balanceLine = useMemo(() => {
    if (isEdit || !account) return null;
    // Words where the figure has a direction (D11 A): a card is "owed", a bank "overdrawn".
    const words = account.type !== "person";
    const available = words ? formatBalance(account.balance, account.type) : `${formatMoney(account.balance)} available`;
    const afterThis = (after: number, income = false) =>
      words && after < 0
        ? `${formatBalance(after, account.type)} after this`
        : `${formatMoney(after)} ${income ? "after this" : "left after this"}`;
    if (isMoveType) {
      const dest = toAccount ? ` → ${toAccount.name}` : "";
      return entered > 0
        ? `From ${account.name}${dest} · ${afterThis(account.balance - entered)}`
        : `From ${account.name}${dest} · ${available}`;
    }
    if (!(entered > 0)) {
      return `From ${account.name} · ${available}`;
    }
    if (type === "expense" && owedTotal > 0) {
      const share = Math.max(entered - owedTotal, 0);
      return `From ${account.name} · your share ${formatMoney(share)} · ${formatMoney(owedTotal)} owed to you`;
    }
    const after = type === "income" ? account.balance + entered : account.balance - entered;
    return `${type === "income" ? "To" : "From"} ${account.name} · ${afterThis(after, type === "income")}`;
  }, [account, toAccount, entered, type, isMoveType, isEdit, owedTotal]);

  const setAmount = (next: string) =>
    setValue("amount", next, { shouldValidate: true });

  // The category row is kind-filtered; switching type drops a selection
  // that no longer belongs (an income can't keep a Food category).
  // Edit mode: type is immutable — the segment ignores taps.
  const switchType = (next: FormValues["type"]) => {
    if (isEdit) return;
    setValue("type", next);
    const selected = categories.find((c) => c._id === watch("category"));
    if (selected && selected.kind !== next) {
      setValue("category", "");
    }
    // A split belongs to the expense it was built for — carrying it to Income or
    // Transfer would leave stale person rows behind a section that's no longer shown.
    if (next !== "expense") {
      setSplitOpen(false);
      setSplitRows([]);
    }
  };

  // The tick fires only where the figure changed. A key the rules reject — a second
  // decimal point, a third decimal place, the ceiling, backspace on empty — stays silent,
  // so the absence of a tap is the answer.
  const pressKey = (key: (typeof KEYS)[number]) => {
    const cur = amountRaw ?? "";
    if (key === "back") {
      if (cur === "") return;
      haptics.tap();
      setAmount(cur.slice(0, -1));
      return;
    }
    if (key === ".") {
      if (cur.includes(".")) return;
      haptics.tap();
      setAmount(cur === "" ? "0." : cur + ".");
      return;
    }
    const dot = cur.indexOf(".");
    if (dot !== -1 && cur.length - dot > 2) return; // max 2 decimals
    if (cur.replace(".", "").length >= 9) return; // sane upper bound
    haptics.tap();
    setAmount(cur === "0" ? key : cur + key); // a lone leading zero is replaced, not appended
  };

  // The account checks RHF can't do in the resolver. Each buzzes: the message lands at the
  // bottom of a long form and the row it's about may be scrolled out of sight.
  const reject = (message: string) => {
    haptics.error();
    setSubmitError(message);
  };

  const onSubmit = async (data: FormValues) => {
    if (!account) {
      reject("Account is missing");
      return;
    }
    // Transfer/invest needs a distinct destination; RHF can't validate account state.
    const move = data.type === "transfer" || data.type === "invest";
    if (move) {
      if (!toAccount) {
        reject(data.type === "invest" ? "Choose which investment to put this in" : "Choose the destination account");
        return;
      }
      if (toAccount._id === account._id) {
        reject("Pick two different accounts");
        return;
      }
      // Redeeming can't take out more than the holding is worth (the server enforces this
      // too). If it has grown since the last update, the recorded value is stale — the row
      // below lets them update it first.
      if (account.type === "investment" && parseMoney(data.amount) > account.balance) {
        reject(`You can only redeem up to ${formatMoney(account.balance)} — update the value first if it has grown`);
        return;
      }
    }

    // Only send note / location when they carry a value (backend fields are optional).
    const extras = {
      ...(data.note.trim() ? { note: data.note.trim() } : {}),
      ...(data.location.trim() ? { location: data.location.trim() } : {}),
    };

    // A split: `owedBy` becomes one transfer per person, and the expense itself is
    // pared down to the user's own share — see createTransaction on the API.
    let owedBy: { account: string; amount: number }[] | undefined;
    if (!isEdit && data.type === "expense" && splitFilledRows.length > 0) {
      for (const row of splitFilledRows) {
        const rowAmount = parseMoney(row.amount);
        if (!(rowAmount > 0)) {
          reject("Enter what each person owes");
          return;
        }
      }
      const total = splitFilledRows.reduce((sum, row) => sum + parseMoney(row.amount), 0);
      if (total >= entered) {
        reject("Your share must be more than ₹0 — lower what's owed");
        return;
      }
      owedBy = splitFilledRows.map((row) => ({ account: row.accountId!, amount: parseMoney(row.amount) }));
    }
    const share = owedBy ? entered - owedBy.reduce((sum, row) => sum + row.amount, 0) : parseMoney(data.amount);

    // A spend carries title + category; a transfer/invest carries toAccount and neither.
    // Amount is positive paise; `type` gives the direction. Invest posts as a transfer —
    // the destination being an investment account is what makes it an investment (nothing
    // in the ledger distinguishes it; Activity/reviews read the destination's type).
    const fields = move
      ? { type: "transfer", amount: parseMoney(data.amount), account: account._id, toAccount: toAccount!._id, occurredAt: occurredAt.toISOString(), ...extras }
      : {
          type: data.type,
          amount: share,
          account: account._id,
          category: data.category,
          title: data.title,
          occurredAt: occurredAt.toISOString(),
          ...(owedBy ? { owedBy } : {}),
          ...extras,
        };
    // One key per intent, made when the form opened and kept across double taps and re-taps
    // after an error, so a first attempt that landed with only its reply lost can't be
    // saved twice. It doubles as the body clientId, which the server and the outbox already
    // dedupe on. A changed value is a new intent and gets a new key.
    const clientId = idem.keyFor("POST", "/transactions", fields);
    const payload = { ...fields, clientId };

    setSubmitting(true);
    setSubmitError(null);
    let edited: { path: string; sent: Record<string, unknown>; saved: { updatedAt?: string } | null } | null = null;
    try {
      if (isEdit) {
        // Account moves are deferred in edit; patch only the editable fields per type.
        const editPayload = data.type === "transfer"
          ? { amount: parseMoney(data.amount), occurredAt: occurredAt.toISOString(), ...extras }
          : { title: data.title, amount: parseMoney(data.amount), category: data.category, occurredAt: occurredAt.toISOString(), ...extras };
        const saved = await patch<{ updatedAt?: string } | null>(`/transactions/${id}`, editPayload, { idempotencyKey: idem.keyFor("PATCH", `/transactions/${id}`, editPayload) });
        edited = { path: `/transactions/${id}`, sent: editPayload, saved };
      }
      else {
        await post("/transactions", payload, { idempotencyKey: clientId });
      }
      idem.reset();
      // Every save here moves a balance — a plain edit's amount, a split's transfers, an
      // ordinary expense's account. The list held elsewhere (Net Worth, the account
      // picker) is stale until this reloads it. Caught rather than awaited-and-thrown: a
      // drop here means the save itself still worked, and the store's next successful
      // load fills in the real number anyway.
      await useAccountStore.getState().load().catch(() => {});
      // A title typed for the first time this session — fire-and-forget, so a title
      // logged just now can be suggested on the very next transaction rather than
      // waiting for the next launch. Not awaited: nothing on this screen depends on it.
      if (!isEdit && !move) void useTitleSuggestionStore.getState().load();
      if (draftFrom) useOutbox.getState().discard(draftFrom);
      goBackOrHome();
      // The screen is already gone by the time this shows, so it is the only receipt —
      // hence naming the amount and direction rather than just "Saved".
      const amount = formatMoney(parseMoney(data.amount));
      if (isEdit && edited && editOriginal && editUndoAllowed.transaction(editOriginal)) {
        editWithUndo({
          path: edited.path,
          previous: previousValues(editOriginal, edited.sent, { note: "", location: "" }),
          saved: edited.saved,
          message: `Changes saved — ${amount}`,
          reload: () => useAccountStore.getState().load(),
        });
      }
      else if (isEdit) toast.success(`Changes saved — ${amount}`);
      else if (data.type === "invest") toast.success(`${amount} invested in ${toAccount!.name}`);
      else if (data.type === "transfer" && account.type === "investment") toast.success(`${amount} redeemed from ${account.name}`);
      else if (data.type === "transfer") toast.success(`${amount} moved to ${toAccount!.name}`);
      else if (data.type === "income") toast.success(`${amount} added to ${account.name}`);
      else if (owedBy) {
        const owedTotalSaved = owedBy.reduce((sum, row) => sum + row.amount, 0);
        toast.success(`${amount} spent on ${data.title.trim()} — ${formatMoney(owedTotalSaved)} owed to you`);
      }
      else toast.success(`${amount} spent on ${data.title.trim()}`);
    }
    catch (err) {
      // Only a genuinely new create can queue — an edit's failure has nowhere else to
      // go, and the account/category it names must already exist for its own sake, so
      // there's nothing queuing would fix later.
      if (!isEdit && err instanceof ApiError && err.status === 0) {
        await useOutbox.getState().enqueue(clientId, payload);
        if (draftFrom) useOutbox.getState().discard(draftFrom);
        goBackOrHome();
        toast.info(`${formatMoney(parseMoney(data.amount))} saved offline — will sync once you're back online`);
        return;
      }
      // On the screen rather than toasted — everything the user typed is still in the
      // fields, and the reason has to be readable next to it.
      const { byField, rest } = splitIssues(err, { title: "title", amount: "amount", category: "category" } as const, "Error creating new transaction");
      for (const [field, message] of Object.entries(byField) as [keyof FormValues, string][]) setError(field, { message });
      if (rest) reject(rest);
      else haptics.error();
    }
    finally {
      setSubmitting(false);
    }
  }

  // Adding queues offline (store/outbox.ts); an edit has nowhere to wait.
  const editGate = useOnlineGate("Save Changes");
  // What the offline strip dates: the record in edit mode, else the accounts behind the balances.
  const accountsFetchedAt = useAccountStore((s) => s.fetchedAt);
  const strip = { hasData: true, error: null, refetch: () => {}, fetchedAt: isEdit ? editFetchedAt : accountsFetchedAt };

  if (isEdit && editLoad) {
    return (
      <ScreenScaffold title="Edit transaction" back="close">
        {editLoad.notFound
          ? <NotFoundState thing="transaction" />
          : <ErrorState message={editLoad.message} onRetry={() => { setEditLoad(null); setEditAttempt((n) => n + 1); }} />}
      </ScreenScaffold>
    );
  }

  if (isEdit && editFetchedAt === null) {
    return (
      <ScreenScaffold title="Edit transaction" back="close" scroll={false}>
        <View style={styles.body}>
          <SkeletonState height={44} borderRadius={radius.md} />
          <SkeletonState height={88} borderRadius={radius.lg} />
          <ListSkeleton rows={3} height={56} />
        </View>
      </ScreenScaffold>
    );
  }

  return (
    // A native modal route hosts its own portal — without this, gorhom sheets render
    // behind the modal and read as unclickable.
    <BottomSheetModalProvider>
    <ScreenScaffold title={isEdit ? "Edit transaction" : "Add transaction"} back="close" scroll={false} states={strip}>
      <View style={styles.body}>
        {/* Type — Expense / Income / Transfer. Immutable in edit mode. */}
        <View pointerEvents={isEdit ? "none" : "auto"} style={isEdit ? styles.segRowLocked : undefined}>
          <SegmentedControl segments={TYPE_SEGMENTS} value={type} onChange={switchType} accessibilityLabel="Type" />
        </View>

        {/* Amount hero — spec .heroamt: numpad digits stream straight in */}
        <View style={styles.heroAmt}>
          <View style={styles.heroRow}>
            <AppText size="lg" weight="bold" color="inkDim" style={styles.heroCur}>
              ₹
            </AppText>
            <AppText weight="black" style={styles.heroVal}>
              {formatAmountDisplay(amountRaw)}
            </AppText>
            <View style={styles.caret} />
          </View>
          {balanceLine && (
            <AppText size="xs" color="inkDim">
              {balanceLine}
            </AppText>
          )}
          {errors.amount && amountRaw !== "" && (
            <AppText size="xs" weight="bold" color="danger">
              {errors.amount.message}
            </AppText>
          )}
        </View>

        {/* Scrollable middle — title, category, account, date, note */}
        <ScrollView
          style={styles.midScroll}
          contentContainerStyle={styles.midContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          {/* Switching type rebuilds this list — a transfer has no title or category, and
              gains a destination. The fades keep that from reading as a glitch. */}
          {!isMoveType && (
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.field}>
              <Controller
                control={control}
                name="title"
                render={({ field: { value, onChange, onBlur } }) => (
                  <GhostTitleInput
                    placeholder="e.g. Groceries at BigBasket"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.title?.message}
                    ghostSuffix={ghostSuffix}
                    onAcceptGhost={() => ghostMatch && acceptTitleSuggestion(ghostMatch)}
                  />
                )}
              />
              {titleMatches.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.suggestionRow}
                >
                  {titleMatches.map((match) => {
                    const cat = categories.find((c) => c._id === match.category);
                    return (
                      <SuggestionChip
                        key={match.title}
                        label={match.title}
                        icon={(cat?.icon ?? "more") as IconName}
                        color={(cat?.color ?? "accent") as ColorToken}
                        onPress={() => acceptTitleSuggestion(match)}
                      />
                    );
                  })}
                </ScrollView>
              )}
            </Animated.View>
          )}

          {/* The shared tiered picker, same as Bills / Budgets. Hidden for transfers/invest. */}
          {!isMoveType && (
            <Animated.View
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(120)}
              style={styles.field}
            >
              <PressableScale
                style={styles.selRow}
                onPress={() => categoryRef.current?.present()}
                scaleTo={0.98}
                accessibilityLabel={`Category, ${selectedCategory ? selectedCategoryLabel.path : "Choose a category"}`}
              >
                <Icon
                  name={(selectedCategory?.icon ?? "add") as IconName}
                  size={17}
                  containerSize={34}
                  containerRadius={11}
                  container="square"
                  gradient={(selectedCategory?.color ?? "accent") as ColorToken}
                />
                <View style={styles.selText}>
                  <Caps>Category</Caps>
                  {/* Inline breadcrumb: the row already has a label, so the parent shares
                      the value line — "Fuel" has to show it lands in Transportation. */}
                  <CategoryName
                    categoryId={watch("category")}
                    size="sm"
                    weight="semibold"
                    inline
                    placeholder="Choose a category"
                  />
                </View>
                <Icon name="chevronRight" size={20} color="inkDim" />
              </PressableScale>
              {errors.category && (
                <AppText size="xs" weight="bold" color="danger">{errors.category.message}</AppText>
              )}
            </Animated.View>
          )}

          {/* A spend picks one source; a transfer/invest picks source → destination. Not
              editable in edit mode — it would need cross-account balance reconciliation. */}
          {!isEdit && !isMoveType && (
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
              <PressableScale style={styles.selRow} onPress={() => accountRef.current?.present()} scaleTo={0.98} accessibilityLabel={`Paid from, ${account?.name ?? "Select account"}`}>
                <Icon name="wallet" size={18} color="inkDim" />
                <AppText size="sm" weight="bold" style={styles.selValue}>
                  {account?.name ?? "Select account"}
                </AppText>
                <Icon name="chevronRight" size={20} color="inkDim" />
              </PressableScale>
            </Animated.View>
          )}

          {/* Split — only a fresh expense can start one; editing one row of an existing
              split is still possible below in Activity, just not from here. */}
          {!isEdit && type === "expense" && (
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.stack}>
              <PressableScale
                style={[styles.selRow, !splitOpen && styles.selRowDim]}
                onPress={toggleSplit}
                scaleTo={0.98}
                accessibilityState={{ expanded: splitOpen }}
                accessibilityLabel={owedTotal > 0 ? `Split, ${formatMoney(owedTotal)} owed to you` : "Split with people"}
              >
                <Icon name="person" size={18} color="inkDim" />
                <AppText size="sm" weight="semibold" color={splitOpen ? "ink" : "inkDim"} style={styles.selValue}>
                  {owedTotal > 0 ? `Split · ${formatMoney(owedTotal)} owed to you` : "Split with people"}
                </AppText>
                <Icon name={splitOpen ? "chevronDown" : "chevronRight"} size={20} color="inkDim" />
              </PressableScale>

              {splitOpen && (
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={styles.stack}>
                  {splitRows.map((row) => {
                    const person = allAccounts.find((a) => a._id === row.accountId);
                    return (
                      <View key={row.key} style={styles.splitRow}>
                        <PressableScale
                          style={styles.splitPerson}
                          scaleTo={0.98}
                          accessibilityLabel={person?.name ?? "Choose person"}
                          onPress={() => {
                            setActiveSplitKey(row.key);
                            splitAccountRef.current?.present();
                          }}
                        >
                          <Icon name={(person?.icon ?? "person") as IconName} size={16} color="inkDim" />
                          <AppText size="sm" weight="bold" color={person ? "ink" : "inkDim"} style={styles.selValue}>
                            {person?.name ?? "Choose person"}
                          </AppText>
                        </PressableScale>
                        <View style={styles.splitAmount}>
                          <AppText size="sm" color="inkDim">₹</AppText>
                          <Input
                            value={row.amount}
                            onChangeText={(v) => setSplitAmount(row.key, v)}
                            placeholder="0"
                            keyboardType="decimal-pad"
                            editable={!!row.accountId}
                            style={styles.splitAmountInput}
                            accessibilityLabel={`${person?.name ?? "This person"}'s share`}
                          />
                        </View>
                        <PressableScale style={styles.splitRemove} onPress={() => removeSplitRow(row.key)} scaleTo={0.9} accessibilityLabel={`Remove ${person?.name ?? "this person"} from the split`}>
                          <Icon name="close" size={16} color="inkDim" />
                        </PressableScale>
                      </View>
                    );
                  })}

                  <View style={styles.splitActions}>
                    <PressableScale onPress={addSplitRow} scaleTo={0.98} disabled={splitRows.length >= 10}>
                      <AppText size="sm" weight="bold" color="primary">+ Add person</AppText>
                    </PressableScale>
                    {splitFilledRows.length > 0 && (
                      <PressableScale onPress={splitEqually} scaleTo={0.98}>
                        <AppText size="sm" weight="bold" color="primary">Split equally</AppText>
                      </PressableScale>
                    )}
                  </View>
                </Animated.View>
              )}
            </Animated.View>
          )}

          {!isEdit && isMoveType && (
            <Animated.View
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(120)}
              style={styles.stack}
            >
              <PressableScale style={styles.selRow} onPress={() => accountRef.current?.present()} scaleTo={0.98} accessibilityLabel={`From, ${account?.name ?? "Select account"}`}>
                <Icon name="wallet" size={18} color="inkDim" />
                <View style={styles.selText}>
                  <Caps>From</Caps>
                  <AppText size="sm" weight="bold">{account?.name ?? "Select account"}</AppText>
                </View>
                <Icon name="chevronRight" size={20} color="inkDim" />
              </PressableScale>

              <PressableScale
                style={styles.selRow}
                onPress={() => toAccountRef.current?.present()}
                scaleTo={0.98}
                accessibilityLabel={`${isRedeem ? "Redeem to" : type === "invest" ? "Invest in" : "To"}, ${toAccount?.name ?? (type === "invest" ? "Select an investment" : "Select destination")}`}
              >
                <Icon name={type === "invest" ? "investments" : "activity"} size={18} color="inkDim" />
                <View style={styles.selText}>
                  <Caps>{isRedeem ? "Redeem to" : type === "invest" ? "Invest in" : "To"}</Caps>
                  <AppText size="sm" weight="bold" color={toAccount ? "ink" : "inkDim"}>
                    {toAccount?.name ?? (type === "invest" ? "Select an investment" : "Select destination")}
                  </AppText>
                </View>
                <Icon name="chevronRight" size={20} color="inkDim" />
              </PressableScale>

              {/* Redeeming books at the recorded value — offer to correct it first, since a
                  holding that grew since the last update would otherwise redeem low (and the
                  guard in onSubmit blocks redeeming more than what's recorded). */}
              {isRedeem && redeemHolding && (
                <PressableScale style={styles.selRow} onPress={() => revalueRef.current?.present()} scaleTo={0.98} accessibilityLabel={`Worth now, ${formatMoney(account!.balance)}. Tap to update if it's grown`}>
                  <Icon name="investments" size={18} color="inkDim" />
                  <View style={styles.selText}>
                    <Caps>Worth now</Caps>
                    <AppText size="sm" weight="bold">
                      {formatMoney(account!.balance)}
                      <AppText size="xs" weight="semibold" color="inkDim"> · tap to update if it's grown</AppText>
                    </AppText>
                  </View>
                  <Icon name="chevronRight" size={20} color="inkDim" />
                </PressableScale>
              )}
            </Animated.View>
          )}

          {/* Date + time row — defaults to now; tap to set when it actually happened. */}
          <DateField label="When" mode="datetime" value={occurredAt} onChange={setOccurredAt} maximumDate={new Date()} />

          {/* Progressive disclosure — tap to reveal note + location fields. */}
          <PressableScale
            style={[styles.selRow, !extrasOpen && styles.selRowDim]}
            onPress={() => setExtrasOpen((open) => !open)}
            scaleTo={0.98}
            accessibilityState={{ expanded: extrasOpen }}
            accessibilityLabel={extrasOpen ? "Note and location" : "Add note or location"}
          >
            <Icon name="add" size={18} color="inkDim" />
            <AppText size="sm" weight="semibold" color={extrasOpen ? "ink" : "inkDim"} style={styles.selValue}>
              {extrasOpen ? "Note & location" : "Add note · location"}
            </AppText>
            <Icon name={extrasOpen ? "chevronDown" : "chevronRight"} size={20} color="inkDim" />
          </PressableScale>

          {extrasOpen && (
            // Fades in, so the two fields read as revealed by the row above rather than
            // as a jump.
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(120)}
              style={styles.stack}
            >
              <Controller
                control={control}
                name="note"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    label="Note"
                    placeholder="Add a note"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    multiline
                  />
                )}
              />
              <Controller
                control={control}
                name="location"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    label="Location"
                    placeholder="e.g. Connaught Place"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                )}
              />
            </Animated.View>
          )}
        </ScrollView>

        {/* Fixed bottom — numpad + save, always visible with the amount above */}
        {submitError && (
          <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
            <FormError message={submitError} />
          </Animated.View>
        )}

        <View style={styles.numpad}>
          {KEYS.map((key) => (
            // A plain Pressable, not PressableScale: a keypad is pressed fast, and a
            // spring still settling when the next digit lands reads as lag. The instant
            // background lift is the affordance instead.
            <Pressable
              key={key}
              onPress={() => pressKey(key)}
              style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
              accessibilityLabel={key === "back" ? "Delete digit" : key}
            >
              {key === "back" ? (
                <Icon name="backspace" size={20} color="inkDim" />
              ) : (
                <AppText size="lg" weight="bold" color={key === "." ? "inkDim" : "ink"}>
                  {key === "." ? "·" : key}
                </AppText>
              )}
            </Pressable>
          ))}
        </View>

        <Button
          onPress={handleSubmit(onSubmit)}
          loading={submitting}
          disabled={isEdit && !editGate.allowed}
          icon={isEdit ? editGate.icon : undefined}
          hint={isEdit ? editGate.hint : undefined}
          label={
            isEdit ? editGate.label
            : type === "income" ? "Save Income"
            : type === "invest" ? (entered > 0 ? `Invest ${formatMoney(entered)}` : "Invest")
            : isRedeem ? (entered > 0 ? `Redeem ${formatMoney(entered)}` : "Redeem")
            : type === "transfer" ? (entered > 0 ? `Transfer ${formatMoney(entered)}` : "Transfer")
            : "Save Expense"
          }
        />
      </View>

      <AccountPickerSheet ref={accountRef} selectedId={accountId} onPick={setAccountId} excludeTypes={["investment"]} />
      {/* Invest filters the destination to investment accounts; a plain transfer shows all. */}
      <AccountPickerSheet
        ref={toAccountRef}
        selectedId={toAccountId}
        onPick={setToAccountId}
        title={type === "invest" ? "Invest in" : undefined}
        filterType={type === "invest" ? "investment" : undefined}
      />
      {/* One sheet shared by every split row — `activeSplitKey` says which row it's for. */}
      <AccountPickerSheet
        ref={splitAccountRef}
        title="Who owes you"
        selectedId={splitRows.find((r) => r.key === activeSplitKey)?.accountId}
        filterType="person"
        allowCreate
        onPick={(pickedId) => {
          if (activeSplitKey) setSplitRows((rows) => rows.map((r) => (r.key === activeSplitKey ? { ...r, accountId: pickedId } : r)));
        }}
      />
      <CategoryPickerSheet
        ref={categoryRef}
        kind={type === "income" ? "income" : "expense"}
        onPick={(categoryId) => setValue("category", categoryId, { shouldValidate: true })}
      />
      {/* Redeem mode only — one holding, so the sheet reads as "what's this worth now".
          syncAccountBalance reloads the account store, so the value line and redeem guard
          above pick up the new figure; the write refreshes invested/growth. */}
      <RevalueSheet
        ref={revalueRef}
        holdings={redeemHolding ? [{ accountId: redeemHolding.accountId, name: redeemHolding.name, invested: redeemHolding.invested, current: redeemHolding.current }] : []}
      />
    </ScreenScaffold>
    </BottomSheetModalProvider>
  );
};

const styles = StyleSheet.create({
  // Fixed top / scrollable middle / fixed bottom, so the amount hero and the numpad stay
  // on screen together whatever the middle fields do.
  body: {
    flex: 1,
    gap: spacing.md,
  },
  midScroll: {
    flex: 1,
  },
  midContent: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  field: {
    gap: spacing.sm,
  },
  suggestionRow: {
    gap: spacing.sm,
    paddingRight: spacing.sm, // so the last chip isn't flush with the screen edge
  },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  // A fading block holding more than one row has to carry the gap the scroll container
  // would have given those rows directly.
  stack: {
    gap: spacing.lg,
  },
  splitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  splitPerson: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  splitAmount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    width: 92,
  },
  splitAmountInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  splitRemove: {
    padding: 8,
  },
  splitActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  // Edit mode — the immutable type segment reads as inert, not interactive
  segRowLocked: {
    opacity: 0.55,
  },
  heroAmt: {
    alignItems: "center",
    gap: 6,
    paddingVertical: spacing.sm,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroCur: {
    marginRight: 3,
    marginBottom: 14, // superscript ₹, like the spec
  },
  heroVal: {
    fontSize: 46, // spec .heroamt .val 38px × device scale
    letterSpacing: -1.4,
  },
  caret: {
    width: 3,
    height: 34,
    borderRadius: 2,
    marginLeft: 5,
    backgroundColor: "#A394FF",
    shadowColor: "#A394FF",
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  // Spec .selrow — glass strip with icon · value · chevron
  selRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
  },
  selRowDim: {
    opacity: 0.75,
  },
  selValue: {
    flex: 1,
  },
  selText: {
    flex: 1,
    gap: 2,
  },
  numpad: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9, // spec .numpad gap × device scale
  },
  key: {
    flexGrow: 1,
    flexBasis: "30%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  keyPressed: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
});

export default AddTransaction;
