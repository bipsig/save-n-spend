import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { CategoryKind, ICategory } from "@save-n-spend/types";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import ColorPicker from "@/components/ui/ColorPicker";
import Icon from "@/components/ui/Icon";
import IconPicker from "@/components/ui/IconPicker";
import Input from "@/components/ui/Input";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { createCategory, updateCategory } from "@/lib/categories";
import { haptics } from "@/lib/haptics";
import type { IconName } from "@/lib/icons";
import { toast } from "@/store/toast";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";

type Props = {
  /** The category being edited, or `null` to create a new one. */
  category: ICategory | null;
  onSaved?: () => void;
};

const KINDS: { key: CategoryKind; label: string }[] = [
  { key: "expense", label: "Expense" },
  { key: "income", label: "Income" },
];

// Spec §08 — New / Edit category (Tier-2). One sheet for both: the fields are
// identical, and `category` being null is the only difference the form cares about.
const EditCategorySheet = forwardRef<BottomSheetModal, Props>(({ category, onSaved }, ref) => {
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const editing = category !== null;

  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [icon, setIcon] = useState<IconName>("food");
  const [color, setColor] = useState<ColorToken>("accent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the row being edited (or the defaults for a new one) whenever the target
  // changes, so opening the sheet on a second category never shows the first's name.
  useEffect(() => {
    setName(category?.name ?? "");
    setKind(category?.kind ?? "expense");
    setIcon((category?.icon as IconName) ?? "food");
    setColor((category?.color as ColorToken) ?? "accent");
    setError(null);
  }, [category]);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      haptics.error();
      setError("Give the category a name of at least two characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editing) await updateCategory(category._id, { name: trimmed, icon, color });
      else await createCategory({ name: trimmed, kind, icon, color });
      onSaved?.();
      dismiss();
      // Names the category, not the action: after closing the sheet the list behind
      // may have scrolled, and "Groceries saved" is findable where "Saved" isn't.
      toast.success(editing ? `${trimmed} updated` : `${trimmed} added`);
    }
    catch (err) {
      haptics.error();
      setError(err instanceof Error ? err.message : "Couldn't save the category. Try again.");
    }
    finally {
      setBusy(false);
    }
  };

  return (
    <AppSheet
      ref={innerRef}
      scrollable
      snapPoints={["78%"]}
      onDismiss={() => setError(null)}
      footer={
        <Button
          label={editing ? "Save changes" : "Create category"}
          loading={busy}
          onPress={save}
        />
      }
    >
      {/* Live preview — the chip is what this category will look like in a row. */}
      <View style={styles.identity}>
        <Icon name={icon} size={24} containerSize={52} container="square" gradient={color} />
        <View style={styles.identityText}>
          <AppText size="md" weight="black" numberOfLines={1}>
            {name.trim() || (editing ? "Edit category" : "New category")}
          </AppText>
          <AppText size="xs" color="inkDim">
            {kind === "income" ? "Money coming in" : "Money going out"}
          </AppText>
        </View>
      </View>

      <Input
        label="Name"
        placeholder="e.g. Groceries"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        InputComponent={BottomSheetTextInput}
      />

      <View style={styles.field}>
        <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>
          TYPE
        </AppText>
        {editing ? (
          // Locked after creation: every transaction already filed here counts as
          // this kind, so flipping it would restate history rather than edit a label.
          <View style={styles.lockedKind}>
            <Badge
              label={kind === "income" ? "Income" : "Expense"}
              status={kind === "income" ? "paid" : "onTrack"}
            />
            <AppText size="xs" color="inkDim" style={styles.lockedNote}>
              Fixed once a category exists — its past transactions depend on it.
            </AppText>
          </View>
        ) : (
          <SegmentedControl segments={KINDS} value={kind} onChange={setKind} />
        )}
      </View>

      <View style={styles.field}>
        <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>
          ICON
        </AppText>
        <IconPicker value={icon} onChange={setIcon} />
      </View>

      <View style={styles.field}>
        <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>
          COLOUR
        </AppText>
        <ColorPicker value={color} onChange={setColor} />
      </View>

      {error && (
        <AppText size="sm" color="danger">
          {error}
        </AppText>
      )}
    </AppSheet>
  );
});

EditCategorySheet.displayName = "EditCategorySheet";

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
  field: {
    gap: spacing.sm,
  },
  // spec .flabel — tiny caps, wide tracking
  fieldLabel: {
    letterSpacing: 1.3,
  },
  lockedKind: {
    gap: spacing.xs,
    alignItems: "flex-start",
  },
  lockedNote: {
    lineHeight: 17,
  },
});

export default EditCategorySheet;
