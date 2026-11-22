import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import type { ITrip } from "@save-n-spend/types";
import AppSheet from "./AppSheet";
import ConfirmSheet from "./ConfirmSheet";
import { AppText } from "@/components/ui/AppText";
import Caps from "@/components/ui/Caps";
import AmountHeroInput from "@/components/ui/AmountHeroInput";
import Button from "@/components/ui/Button";
import DateField from "@/components/ui/DateField";
import Input from "@/components/ui/Input";
import { createAccount, useAccounts } from "@/lib/accounts";
import { haptics } from "@/lib/haptics";
import { parseMoney, paiseToInput } from "@/lib/money";
import { startOfToday } from "@/lib/date";
import { TRIP_EMOJIS, TRIP_GRADIENTS, createTrip, pickerToTripDay, reloadAfterTripDelete, reloadTripNames, tripDayToPicker, updateTrip } from "@/lib/trips";
import { deleteTarget, deletedMessage, deleteWithUndo, editWithUndo, previousValues } from "@/lib/undo";
import { holderFor } from "@/lib/idempotency";
import { recoverCreated, sameName } from "@/lib/replayed";
import { useAccountStore } from "@/store/accounts";
import { useTripNameStore } from "@/store/tripNames";
import { toast } from "@/store/toast";
import { colors, spacing } from "@/theme";
import { useOnlineGate } from "@/lib/onlineGate";
import { errorText, splitIssues } from "@/lib/apiError";
import { useFormError } from "@/lib/useFormError";
import FieldError from "@/components/ui/FieldError";
import SheetFooter from "./SheetFooter";
import { tripFormSchema } from "@/lib/formSchemas";
import { useSchemaForm } from "@/lib/useSchemaForm";

type Props = {
  /** The trip being edited, or null for a new one. */
  trip: ITrip | null;
  /** Optional: the write already refreshes every trip screen. */
  onSaved?: (tripId: string) => void;
  /** After the trip is deleted — the trip's own screen has nothing left to show. */
  onDeleted?: () => void;
  /** Named in the delete's toast: "Goa 2026 deleted with 14 expenses". */
  expenseCount?: number;
};

// New trip / edit trip. The people are person accounts — the same ones splits and settle-ups
// already use — picked with a tick, or added here by name.
const TripSheet = forwardRef<BottomSheetModal, Props>(({ trip, onSaved, onDeleted, expenseCount = 0 }, ref) => {
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  // Needs the server: offline the button says so before the tap.
  const gate = useOnlineGate("");
  const deleteRef = useRef<BottomSheetModal>(null);
  const people = useAccounts().filter((a) => a.type === "person");

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(TRIP_EMOJIS[0]);
  const [color, setColor] = useState("teal");
  const [start, setStart] = useState<Date>(startOfToday());
  const [end, setEnd] = useState<Date>(startOfToday());
  const [members, setMembers] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [busy, setBusy] = useState(false);
  const { error, fail, clear: clearError } = useFormError();

  // Back to the trip it was opened for (or blank) — on open and on dismiss, so a second new
  // trip never shows the first one's entries.
  const resetForm = useCallback(() => {
    setName(trip?.name ?? "");
    setEmoji(trip?.emoji ?? TRIP_EMOJIS[0]);
    setColor(trip?.color ?? "teal");
    setStart(trip ? tripDayToPicker(trip.startDate) : startOfToday());
    setEnd(trip ? tripDayToPicker(trip.endDate) : startOfToday());
    setMembers(trip?.members ?? []);
    setBudget(trip?.budget ? paiseToInput(trip.budget) : "");
    setNewPerson("");
    clearError();
  }, [trip]);
  useEffect(() => { resetForm(); }, [resetForm]);

  const toggle = (id: string) => {
    haptics.tap();
    setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  };

  const addPerson = async () => {
    const trimmed = newPerson.trim();
    if (trimmed.length < 1) return;
    try {
      const personDraft = { name: trimmed, type: "person" as const, startingBalance: 0 };
      const idem = holderFor("person:new");
      const reply = await createAccount(personDraft, { idempotencyKey: idem.keyFor("POST", "/accounts", personDraft) });
      idem.reset();
      const created = recoverCreated(reply, useAccountStore.getState().list, (a) => a.type === "person" && !a.isArchived && sameName(a.name, trimmed));
      // Not found (two people with that name): saved, and they're in the list below to tick.
      if (created) setMembers((m) => [...m, created._id]);
      setNewPerson("");
    }
    catch (err) {
      fail(errorText(err, "Couldn't add them"));
    }
  };

  const { fieldError, submit, setFieldError } = useSchemaForm(tripFormSchema, { name, start, end });

  const save = () => submit(async () => {
    const budgetPaise = budget.trim() ? parseMoney(budget) : null;
    setBusy(true);
    clearError();
    try {
      const draft = {
        name: name.trim(), emoji, color,
        startDate: pickerToTripDay(start), endDate: pickerToTripDay(end),
        members, budget: budgetPaise && budgetPaise > 0 ? budgetPaise : null,
      };
      let id = trip?._id ?? "";
      let saved: { updatedAt?: string } | null = null;
      if (trip) saved = await updateTrip(trip._id, draft);
      else {
        const idem = holderFor("trip:new");
        const reply = await createTrip(draft, { idempotencyKey: idem.keyFor("POST", "/trips", draft) });
        idem.reset();
        if (!reply) await useTripNameStore.getState().load().catch(() => {});
        const trips = Object.entries(useTripNameStore.getState().byId).map(([_id, t]) => ({ _id, name: t.name }));
        // Empty when it can't be found: the caller then refreshes its list instead of opening it.
        id = reply?._id ?? recoverCreated(null, trips, (t) => sameName(t.name, draft.name))?._id ?? "";
      }
      innerRef.current?.dismiss();
      onSaved?.(id);
      if (trip) editWithUndo({ path: `/trips/${trip._id}`, previous: previousValues(trip, draft), saved, message: `${draft.name} updated`, reload: reloadTripNames });
      else toast.success(`${draft.name} started`);
    }
    catch (err) {
      const { byField, rest } = splitIssues(err, { name: "name", endDate: "end", startDate: "end" } as const, "Couldn't save the trip");
      for (const [field, message] of Object.entries(byField)) setFieldError(field as "name" | "end", { message });
      fail(rest);
    }
    finally {
      setBusy(false);
    }
  });

  const gradient = TRIP_GRADIENTS[color] ?? TRIP_GRADIENTS.teal;

  return (
    <>
      <AppSheet
        ref={innerRef}
        scrollable
        snapPoints={["88%"]}
        onDismiss={resetForm}
        footer={
          <SheetFooter error={error}>
            <Button label={trip ? "Save changes" : "Start trip"} icon={gate.icon} hint={gate.hint} loading={busy} disabled={!gate.allowed} onPress={save} />
          </SheetFooter>
        }
      >
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.band}>
          <AppText size="lg" weight="black" numberOfLines={1}>{emoji} {name.trim() || (trip ? "Edit trip" : "New trip")}</AppText>
        </LinearGradient>

        <Input label="Name" placeholder="e.g. Kerala" value={name} onChangeText={(v) => { setName(v); clearError(); }} autoCapitalize="words" InputComponent={BottomSheetTextInput} error={fieldError("name")} />

        <View style={styles.field}>
          <Caps>Look</Caps>
          <View style={styles.wrap}>
            {TRIP_EMOJIS.map((e) => (
              <Pressable key={e} onPress={() => setEmoji(e)} style={[styles.emoji, emoji === e && styles.emojiOn]} accessibilityRole="radio" accessibilityState={{ selected: emoji === e }} accessibilityLabel={`Emoji ${e}`}>
                <AppText size="lg">{e}</AppText>
              </Pressable>
            ))}
          </View>
          <View style={styles.wrap}>
            {Object.entries(TRIP_GRADIENTS).map(([key, g]) => (
              <Pressable key={key} onPress={() => setColor(key)} accessibilityRole="radio" accessibilityState={{ selected: color === key }} accessibilityLabel={`Colour ${key}`}>
                <LinearGradient colors={g} style={[styles.swatch, color === key && styles.swatchOn]} />
              </Pressable>
            ))}
          </View>
        </View>

        <DateField label="Starts" value={start} onChange={(d) => { setStart(d); if (end < d) setEnd(d); }} />
        <DateField label="Ends" value={end} onChange={setEnd} minimumDate={start} />
        <FieldError message={fieldError("end")} />

        <View style={styles.field}>
          <Caps>Who's going (besides you)</Caps>
          {people.length === 0 && <AppText size="xs" color="inkDim">Add the people on the trip below.</AppText>}
          {people.map((p) => {
            const on = members.includes(p._id);
            return (
              <Pressable key={p._id} onPress={() => toggle(p._id)} style={styles.personRow} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={p.name}>
                <View style={[styles.check, on && styles.checkOn]}>{on && <AppText size="xs" weight="black">✓</AppText>}</View>
                <AppText size="sm" weight="bold" style={styles.grow}>{p.name}</AppText>
              </Pressable>
            );
          })}
          <View style={styles.addRow}>
            <View style={styles.grow}>
              <Input placeholder="Add someone by name" value={newPerson} onChangeText={setNewPerson} autoCapitalize="words" InputComponent={BottomSheetTextInput} onSubmitEditing={addPerson} />
            </View>
            <Button label="Add" size="sm" variant="secondary" icon={gate.icon} hint={gate.hint} onPress={addPerson} disabled={!newPerson.trim() || !gate.allowed} />
          </View>
        </View>

        <View style={styles.field}>
          <Caps>Budget (optional)</Caps>
          <AmountHeroInput value={budget} onChangeText={setBudget} />
          <AppText size="xs" color="inkDim">Your own share you'd like to stay under. Leave blank for none.</AppText>
        </View>

        {trip && <Button label="Delete trip" variant="dangerGhost" icon={gate.icon ?? "delete"} hint={gate.hint} disabled={!gate.allowed} onPress={() => deleteRef.current?.present()} />}
      </AppSheet>

      <ConfirmSheet
        ref={deleteRef}
        icon="delete"
        title={`Delete ${trip?.name ?? "this trip"}?`}
        body="Every expense and settle-up on it comes off, and every balance and account it touched goes back to how it was. The people stay."
        confirmLabel="Delete trip"
        needsConnection
        onConfirm={() => {
          if (!trip) return;
          innerRef.current?.dismiss();
          deleteWithUndo({
            ...deleteTarget.trip(trip._id),
            label: trip.name,
            message: deletedMessage(trip.name, [[expenseCount, "expense", "expenses"]]),
            reload: reloadAfterTripDelete,
          });
          onDeleted?.();
        }}
      />
    </>
  );
});

TripSheet.displayName = "TripSheet";

const styles = StyleSheet.create({
  band: { borderRadius: 18, paddingVertical: 18, paddingHorizontal: 16 },
  field: { gap: spacing.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  emoji: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  emojiOn: { borderColor: colors.primary, backgroundColor: colors.accentSoft },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  swatchOn: { borderWidth: 3, borderColor: colors.ink },
  personRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 8 },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  grow: { flex: 1 },
  addRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
});

export default TripSheet;
