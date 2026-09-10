import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useCategoryLabel } from "@/lib/categories";
import type { ColorToken, FontSizeToken, FontWeightToken } from "@/theme";

type Props = {
  categoryId: string | null | undefined;
  /** Size of the category's own name. The parent is always one step quieter. */
  size?: FontSizeToken;
  /** Weight of the name. The parent is always bold, since it is a heading. */
  weight?: FontWeightToken;
  /** Colour of the name. The parent stays `inkDim` regardless — it is context. */
  color?: ColorToken;
  /** Put the parent on the same line ("Food & Dining › Groceries") instead of above, for
   *  rows that already carry a field label and can't afford a third line. */
  inline?: boolean;
  /** Shown in place of the name when there is no category yet (a picker's resting state). */
  placeholder?: string;
};

// How a single category is named anywhere outside a tree.
//
// A sub-category's name alone is ambiguous: "Groceries" and "Food & Dining" render identically
// in a row, but one is a heading whose total includes the other. A picker or the manage screen
// answers that structurally, with indent and a rail; a row has no structure to lean on, so the
// parent is printed.
//
// A breadcrumb rather than "Groceries (sub-category)", because the useful fact is not that it
// is a child but whose — that is what says where the money lands. A top-level category prints
// its name alone, which is itself the signal that nothing rolls up past it.
const CategoryName = ({
  categoryId,
  size = "sm",
  weight = "bold",
  color = "ink",
  inline = false,
  placeholder,
}: Props) => {
  const label = useCategoryLabel(categoryId);

  // Nothing chosen yet — distinct from a missing category, which `useCategoryLabel` calls
  // "Uncategorised": a picker's prompt and a broken reference are different news.
  if (!categoryId && placeholder) {
    return (
      <AppText size={size} weight={weight} color="inkDim" numberOfLines={1}>
        {placeholder}
      </AppText>
    );
  }

  if (!label.isChild) {
    return (
      <AppText size={size} weight={weight} color={color} numberOfLines={1}>
        {label.name}
      </AppText>
    );
  }

  if (inline) {
    // One Text, two spans: RN lays nested <AppText> out as a single run, so the breadcrumb
    // wraps and truncates as one string rather than two views fighting over the width.
    return (
      <AppText size={size} weight={weight} color={color} numberOfLines={1}>
        <AppText size={size} weight="regular" color="inkDim">
          {label.parentName}
          {" › "}
        </AppText>
        {label.name}
      </AppText>
    );
  }

  return (
    <View style={styles.stack}>
      {/* Dim and small, above rather than beside: side-by-side, the two names compete
          and the longer parent wins the row's width from the name that matters. */}
      <AppText size="xs" weight="bold" color="inkDim" numberOfLines={1}>
        {label.parentName} ›
      </AppText>
      <AppText size={size} weight={weight} color={color} numberOfLines={1}>
        {label.name}
      </AppText>
    </View>
  );
};

const styles = StyleSheet.create({
  stack: {
    gap: 1,
  },
});

export default CategoryName;
