import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import AppSheet from "./AppSheet";
import CategoryPickerSheet from "./CategoryPickerSheet";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import Input from "@/components/ui/Input";
import PressableScale from "@/components/ui/PressableScale";
import { useCategoryStore } from "@/store/categories";
import formatMoney, { parseMoney, paiseToInput, usePrivacyMask } from "@/lib/money";
import { spacing, colors } from "@/theme";
import SheetFooter from "./SheetFooter";

export type Part = { title: string; category: string | null; cost: number };

type Props = {
  /** The lump being broken down. */
  row: { title: string; cost: number } | null;
  initial: Part[] | null;
  onSave: (parts: Part[] | null) => void;
};

type Draft = { title: string; category: string | null; amount: string };

// Breaking a lump ("Munnar expense ₹2,325") into what it was — Food ₹1,200, Cabs ₹800, Entry
// ₹325. Each part keeps the lump's split, so your share of each is worked out for you. The
// parts must add up to the lump.
const BreakdownSheet = forwardRef<BottomSheetModal, Props>(({ row, initial, onSave }, ref) => {
  usePrivacyMask();
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const pickerRef = useRef<BottomSheetModal>(null);
  // Live and archived, so a saved part filed under a since-archived category still names it.
  const categories = useCategoryStore((s) => s.all);
  const [parts, setParts] = useState<Draft[]>([]);
  const [picking, setPicking] = useState<number | null>(null);

  const resetForm = useCallback(() => {
    setParts(initial?.length
      ? initial.map((p) => ({ title: p.title, category: p.category, amount: paiseToInput(p.cost) }))
      : [{ title: "", category: null, amount: "" }, { title: "", category: null, amount: "" }]);
  }, [initial]);
  useEffect(() => { resetForm(); }, [resetForm, row?.title]);

  const total = parts.reduce((s, p) => s + (parseMoney(p.amount) || 0), 0);
  const left = (row?.cost ?? 0) - total;
  const set = (i: number, patch: Partial<Draft>) => setParts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <>
      <AppSheet
        ref={innerRef}
        scrollable
        onDismiss={resetForm}
        footer={
          <SheetFooter>
            <View style={styles.status}>
              <AppText size="xs" weight="bold" color={left === 0 ? "success" : "warning"} style={styles.grow}>
                {left === 0 ? "Adds up ✓" : left > 0 ? `${formatMoney(left)} still to assign` : `${formatMoney(-left)} too much`}
              </AppText>
              <Button label="Add a part" icon="add" variant="ghost" size="sm" onPress={() => setParts((ps) => [...ps, { title: "", category: null, amount: "" }])} />
            </View>
            <Button
              label="Use these parts"
              disabled={left !== 0}
              onPress={() => {
                onSave(parts.map((p) => ({ title: p.title.trim() || (row?.title ?? ""), category: p.category, cost: parseMoney(p.amount) || 0 })).filter((p) => p.cost > 0));
                innerRef.current?.dismiss();
              }}
            />
            <Button label="Keep it as one" variant="ghost" onPress={() => { onSave(null); innerRef.current?.dismiss(); }} />
          </SheetFooter>
        }
      >
        <AppText size="md" weight="black">Break down {row?.title}</AppText>
        <AppText size="xs" color="inkDim">{formatMoney(row?.cost ?? 0)} in all. Each part is split the same way as the whole.</AppText>
        {parts.map((p, i) => {
          const cat = categories.find((c) => c._id === p.category);
          return (
            <View key={i} style={styles.part}>
              <View style={styles.row}>
                <View style={styles.grow}><Input placeholder="What was it?" value={p.title} onChangeText={(v) => set(i, { title: v })} InputComponent={BottomSheetTextInput} /></View>
                <View style={styles.amount}><Input placeholder="₹" value={p.amount} onChangeText={(v) => set(i, { amount: v })} keyboardType="decimal-pad" InputComponent={BottomSheetTextInput} /></View>
              </View>
              <View style={styles.row}>
                <PressableScale onPress={() => { setPicking(i); pickerRef.current?.present(); }} scaleTo={0.97} style={styles.catChip} accessibilityLabel={cat ? `Category, ${cat.name}` : "Choose a category"}>
                  <AppText size="xs" weight="bold" color={cat ? "ink" : "inkDim"}>{cat?.name ?? "Category ▾"}</AppText>
                </PressableScale>
                {parts.length > 1 && (
                  <PressableScale onPress={() => setParts((ps) => ps.filter((_, j) => j !== i))} hitSlop={14} scaleTo={0.9} accessibilityLabel={`Remove ${p.title.trim() || "this part"}`}>
                    <Icon name="close" size={16} color="inkDim" />
                  </PressableScale>
                )}
              </View>
            </View>
          );
        })}
      </AppSheet>
      <CategoryPickerSheet ref={pickerRef} kind="expense" onPick={(id) => { if (picking !== null) set(picking, { category: id }); }} />
    </>
  );
});

BreakdownSheet.displayName = "BreakdownSheet";

const styles = StyleSheet.create({
  part: { gap: 6, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.surface2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1 },
  amount: { width: 96 },
  status: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  catChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.fieldBorder, flex: 1 },
});

export default BreakdownSheet;
