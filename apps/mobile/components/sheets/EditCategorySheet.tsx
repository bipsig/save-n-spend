import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { ICategory } from "@save-n-spend/types";
import { NAME_MIN } from "@save-n-spend/types";
import AppSheet from "./AppSheet";
import Button from "@/components/ui/Button";
import CategoryForm, { categoryCtaLabel, type CategoryFormValue } from "@/components/ui/CategoryForm";
import { categoryCreateBody, createCategory, updateCategory, useCategoryById } from "@/lib/categories";
import { holderFor } from "@/lib/idempotency";
import { haptics } from "@/lib/haptics";
import type { IconName } from "@/lib/icons";
import { toast } from "@/store/toast";
import type { ColorToken } from "@/theme";
import { useOnlineGate } from "@/lib/onlineGate";
import { editWithUndo, previousValues } from "@/lib/undo";
import { useCategoryStore } from "@/store/categories";
import { errorText } from "@/lib/apiError";

type Props = {
  /** The category being edited, or `null` to create a new one. */
  category: ICategory | null;
  /**
   * When creating, the top-level category the new one goes under — `null` for a
   * top-level category. Ignored while editing: `parent` is fixed at creation, since
   * re-parenting would move history between two totals someone has already read.
   */
  parent?: ICategory | null;
  onSaved?: () => void;
};

// Spec §08 — New / Edit category (Tier-2). One sheet for both: the fields are
// identical, and `category` being null is the only difference the form cares about.
//
// The parent is decided before the sheet opens (by which "+ Add a sub-category" was
// tapped), so no selector is passed — see CategoryPickerSheet for the variant that
// offers one.
const EditCategorySheet = forwardRef<BottomSheetModal, Props>(({ category, parent = null, onSaved }, ref) => {
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  // Needs the server: offline the button says so before the tap.
  const gate = useOnlineGate("");
  const dismiss = () => innerRef.current?.dismiss();

  const editing = category !== null;
  // The parent to display, either way: the one being created under, or the one the
  // row being edited already sits beneath.
  const shownParent = useCategoryById(editing ? category.parent : parent?._id);

  const [form, setForm] = useState<CategoryFormValue>({
    name: "",
    kind: "expense",
    parent: null,
    icon: "food",
    color: "accent",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (next: Partial<CategoryFormValue>) => setForm((prev) => ({ ...prev, ...next }));

  // Load the row being edited (or the defaults for a new one) whenever the target
  // changes, so opening the sheet on a second category never shows the first's name.
  //
  // A new child inherits its parent's kind, icon, and colour: the server rejects a
  // mismatched kind outright, and starting a child off looking like its parent is
  // both the likely answer and a visible statement of where it belongs.
  const resetForm = useCallback(() => {
    setForm({
      name: category?.name ?? "",
      kind: category?.kind ?? parent?.kind ?? "expense",
      parent: category ? category.parent : parent?._id ?? null,
      icon: (category?.icon as IconName) ?? (parent?.icon as IconName) ?? "food",
      color: (category?.color as ColorToken) ?? (parent?.color as ColorToken) ?? "accent",
    });
    setError(null);
  }, [category, parent]);

  // Also on dismiss: adding a second new category opens on the same props, and must not
  // show the first one's name.
  useEffect(() => { resetForm(); }, [resetForm]);

  const save = async () => {
    const trimmed = form.name.trim();
    if (trimmed.length < NAME_MIN) {
      haptics.error();
      setError("Give the category a name");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let undo: { saved: object; sent: Record<string, unknown> } | null = null;
      if (editing) {
        const sent = { name: trimmed, icon: form.icon, color: form.color };
        undo = { saved: await updateCategory(category._id, sent), sent };
      }
      else {
        const draft = {
          name: trimmed,
          kind: form.kind,
          icon: form.icon,
          color: form.color,
          parent: parent?._id ?? null,
        };
        const idem = holderFor("category:new");
        await createCategory(draft, { idempotencyKey: idem.keyFor("POST", "/categories", categoryCreateBody(draft)) });
        idem.reset();
      }
      onSaved?.();
      dismiss();
      // Names the category, not the action: after closing the sheet the list behind
      // may have scrolled, and "Groceries saved" is findable where "Saved" isn't.
      if (editing && undo) {
        editWithUndo({
          path: `/categories/${category._id}`,
          previous: previousValues(category, undo.sent),
          saved: undo.saved,
          message: `${trimmed} updated`,
          reload: () => useCategoryStore.getState().load(),
        });
      }
      else toast.success(parent ? `${trimmed} added under ${parent.name}` : `${trimmed} added`);
    }
    catch (err) {
      haptics.error();
      setError(errorText(err, "Couldn't save the category. Try again."));
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
      onDismiss={resetForm}
      footer={
        <Button
          label={categoryCtaLabel(editing, editing ? null : parent?._id ?? null)}
          icon={gate.icon}
          hint={gate.hint}
          loading={busy}
          disabled={!gate.allowed}
          onPress={save}
        />
      }
    >
      <CategoryForm
        value={form}
        onChange={patch}
        editing={editing}
        parent={shownParent}
        error={error}
      />
    </AppSheet>
  );
});

EditCategorySheet.displayName = "EditCategorySheet";

export default EditCategorySheet;
