import { FlatList, StyleSheet, View } from "react-native";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import TransactionRow from "@/components/rows/TransactionRow";
import { transactions } from "@/lib/mock";
import { spacing } from "@/theme";

// Gap between rows — kept out of the row itself so the list owns its spacing.
const Separator = () => <View style={styles.separator} />;

const ActivityScreen = () => {
  return (
    <ScreenScaffold title="All Activity" scroll={false}>
      <FlatList
        data={transactions}
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
});

export default ActivityScreen;
