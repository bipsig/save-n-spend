import { FlatList, ScrollView, StyleSheet, View } from "react-native";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import TransactionRow from "@/components/rows/TransactionRow";
import { transactions } from "@/lib/mock";
import { spacing } from "@/theme";
import { useState } from "react";
import { categories, Category } from "@/lib/categories";
import Search from "@/components/ui/Search";
import Chip from "@/components/ui/Chip";

const Separator = () => <View style={styles.separator} />;

const ActivityScreen = () => {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category | "all">("all");

  let filteredTransactions = activeCategory === "all" ? transactions : transactions.filter((transaction) => {
    return transaction.category === activeCategory
  })

  filteredTransactions = query === "" ? filteredTransactions : filteredTransactions.filter((transaction) => {
    return transaction.title.toLowerCase().includes(query.trim().toLowerCase());
  })

  return (
    <ScreenScaffold title="All Activity" scroll={false}>
      <Search
        value={query}
        onChangeText={setQuery}
        placeholder="Search transactions"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipRow}
      >
        <Chip
          key={"all"}
          label="All"
          selected={activeCategory === "all"}
          onPress={() => setActiveCategory("all")}
        />
        {(Object.keys(categories) as Category[]).map((category) => {
          return (
            <Chip
              key={category}
              label={categories[category].label}
              selected={activeCategory === category}
              onPress={() => setActiveCategory(category)}
            />
          )
        })}
      </ScrollView>

      <FlatList
        data={filteredTransactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TransactionRow transaction={item} />}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xl,
  },
  separator: {
    height: spacing.md,
  },
  chipScroll: {
    flexGrow: 0, // keep the row at chip height; don't let it eat vertical space
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
  }
});

export default ActivityScreen;
