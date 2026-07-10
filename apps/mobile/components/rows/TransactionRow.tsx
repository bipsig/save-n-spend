import { StyleSheet, View } from "react-native"
import { categoryById, categoryBg } from "@/lib/categories"
import type { ITransaction } from "@/lib/mock"
import type { IconName } from "@/lib/icons"
import type { ColorToken } from "@/theme"
import { shadows, spacing } from "@/theme"
import { formatTxnDate } from "@/lib/date"
import Icon from "../ui/Icon"
import { AppText } from "../ui/AppText"
import Card from "../data/Card"
import formatMoney from "@/lib/money"

type Props = {
  transaction: ITransaction
}

// One icon + label pair on the meta row (date / location / receipt).
const MetaItem = ({
  icon,
  label,
  color = "gray500",
}: {
  icon: IconName
  label: string
  color?: ColorToken
}) => (
  <View style={styles.metaItem}>
    <Icon name={icon} size={13} color={color} />
    <AppText size="xs" color={color}>
      {label}
    </AppText>
  </View>
)

const TransactionRow = ({ transaction }: Props) => {
  const category = categoryById(transaction.category)
  const isIncome = transaction.type === "income"
  const money = formatMoney(transaction.amount) // amount is positive; type gives the sign

  return (
    <Card style={styles.card}>
      <Icon
        name={(category?.icon ?? "more") as IconName}
        container="square"
        containerColor={categoryBg(category?.color)}
        color={(category?.color ?? "gray500") as ColorToken}
        size={24}
      />

      <View style={styles.details}>
        <AppText size="md" weight="bold">
          {transaction.title}
        </AppText>
        <AppText size="sm" color="gray500">
          {category?.name ?? "Uncategorized"}
        </AppText>
        <View style={styles.metaRow}>
          <MetaItem icon="date" label={formatTxnDate(transaction.occurredAt)} />
          {transaction.location && (
            <MetaItem icon="location" label={transaction.location} />
          )}
          {transaction.receiptUrl && (
            <MetaItem icon="receipt" label="Receipt" color="primary" />
          )}
        </View>
      </View>

      <AppText size="md" weight="bold" color={isIncome ? "success" : "danger"}>
        {isIncome ? `+${money}` : `-${money}`}
      </AppText>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    ...shadows.md, // softer, more visible drop than Card's default sm — matches Figma
  },
  details: {
    flex: 1,
    gap: spacing.xs,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
})

export default TransactionRow;
