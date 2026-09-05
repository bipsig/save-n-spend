import { StyleSheet, View } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { CategoryKind, ICategory } from "@save-n-spend/types";
import { AppText } from "@/components/ui/AppText";
import Badge from "@/components/ui/Badge";
import ColorPicker from "@/components/ui/ColorPicker";
import Icon from "@/components/ui/Icon";
import IconPicker from "@/components/ui/IconPicker";
import Input from "@/components/ui/Input";
import SegmentedControl from "@/components/ui/SegmentedControl";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";

export type CategoryFormValue = {
  name: string;
  kind: CategoryKind;
  /** `null` = top-level. */
  parent: string | null;
  icon: IconName;
  color: ColorToken;
};

type Props = {
  value: CategoryFormValue;
  onChange: (patch: Partial<CategoryFormValue>) => void;
  /** Editing an existing category rather than creating one. Locks type. */
  editing?: boolean;
  /**
   * The heading this category goes under, for the breadcrumb, or `null` for top-level.
   *
   * The form never asks — both callers settle it before opening, from which "New under
   * …" row was tapped. An in-form selector was tried and removed: it made the user
   * re-read a list of headings they had just scrolled past, and grew by a row every time
   * they added a category.
   */
  parent?: ICategory | null;
  /**
   * Why type isn't editable, when the caller — not this form — is what fixed it.
   * Nesting and editing supply their own reasons and take precedence.
   */
  kindNote?: string;
  error?: string | null;
};

const KINDS: { key: CategoryKind; label: string }[] = [
  { key: "expense", label: "Expense" },
  { key: "income", label: "Income" },
];

// The one category form. Both places that create a category render this: the Manage
// Categories sheet and the picker that opens over Add Transaction.
//
// It exists because those two used to be different forms. The picker's had no preview,
// no field labels, and a "Create category" button that kept saying "category" after you
// had chosen a parent — so the one question a two-level system has to answer, *am I
// making a heading or filing under one*, was the question it left open. Sharing the form
// means the answer can't be right in one place and missing in the other.
const CategoryForm = ({
  value,
  onChange,
  editing = false,
  parent = null,
  kindNote,
  error,
}: Props) => {
  const parentName = parent?.name;
  const nesting = !editing && parent !== null;

  return (
    <>
      {/* Live preview — what this category will look like in a row. The parent sits
          above the name as a breadcrumb, so a child's name is never shown without the
          heading its spending lands in. */}
      <View style={styles.identity}>
        <Icon name={value.icon} size={24} containerSize={52} container="square" gradient={value.color} />
        <View style={styles.identityText}>
          {parentName && (
            <AppText size="xs" weight="bold" color="primary" numberOfLines={1}>
              {parentName} ›
            </AppText>
          )}
          <AppText size="md" weight="black" numberOfLines={1}>
            {value.name.trim() || (nesting ? "New sub-category" : editing ? "Edit category" : "New category")}
          </AppText>
          <AppText size="xs" color="inkDim">
            {parentName
              ? `Counts towards ${parentName}`
              : value.kind === "income" ? "Money coming in" : "Money going out"}
          </AppText>
        </View>
      </View>

      <Input
        label="Name"
        placeholder="e.g. Groceries"
        value={value.name}
        onChangeText={(name) => onChange({ name })}
        autoCapitalize="words"
        InputComponent={BottomSheetTextInput}
      />

      <View style={styles.field}>
        <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>
          TYPE
        </AppText>
        {editing || nesting || kindNote ? (
          // Locked, for one of three reasons. Editing: every transaction already filed
          // here counts as this kind, so flipping it would restate history rather than
          // edit a label. Nesting: a child's spend is added to its parent's, so an income
          // child under an expense parent would fold earnings into a spending total — the
          // server rejects it, and the form shouldn't offer it. Otherwise the caller
          // fixed it, and says why.
          <View style={styles.lockedKind}>
            <Badge
              label={value.kind === "income" ? "Income" : "Expense"}
              status={value.kind === "income" ? "paid" : "onTrack"}
            />
            <AppText size="xs" color="inkDim" style={styles.lockedNote}>
              {nesting
                ? `Inherited from ${parentName} — a sub-category is always the same type as the category above it.`
                : editing
                  ? "Fixed once a category exists — its past transactions depend on it."
                  : kindNote}
            </AppText>
          </View>
        ) : (
          <SegmentedControl segments={KINDS} value={value.kind} onChange={(kind) => onChange({ kind })} />
        )}
      </View>

      <View style={styles.field}>
        <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>
          ICON
        </AppText>
        <IconPicker value={value.icon} onChange={(icon) => onChange({ icon })} />
      </View>

      <View style={styles.field}>
        <AppText size="xs" weight="bold" color="inkDim" style={styles.fieldLabel}>
          COLOUR
        </AppText>
        <ColorPicker value={value.color} onChange={(color) => onChange({ color })} />
      </View>

      {error && (
        <AppText size="sm" color="danger">
          {error}
        </AppText>
      )}
    </>
  );
};

/** The CTA that goes with the form, so its wording tracks the form's state. */
export const categoryCtaLabel = (editing: boolean, parent: string | null): string =>
  editing ? "Save changes" : parent ? "Create sub-category" : "Create category";

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

export default CategoryForm;
