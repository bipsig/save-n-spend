import { StyleSheet, View } from "react-native"
import { categoryById } from "@/lib/categories"
import type { ITransaction } from "@/lib/mock"
import type { IconName } from "@/lib/icons"
import type { ColorToken } from "@/theme"
import { spacing } from "@/theme"
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
  color = "inkDim",
}: {
  icon: IconName
  label: string
  color?: ColorToken
}) => (
  <View style={styles.metaItem}>
    <Icon name={icon} size={14} color={color} />
    <AppText size="xs" color={color} weight={color === "primary" ? "bold" : "regular"}>
      {label}
    </AppText>
  </View>
)

// Spec .rowcard: gradient category chip · name 15/700 · sub 12 dim ·
// tiny meta row · signed amount 15/800 colored by type. Flat glass, no shadow.
const TransactionRow = ({ transaction }: Props) => {
  const category = categoryById(transaction.category)
  const isIncome = transaction.type === "income"
  const money = formatMoney(transaction.amount) // amount is positive; type gives the sign

  return (
    <Card style={styles.card}>
      <Icon
        name={(category?.icon ?? "more") as IconName}
        container="square"
        gradient={(category?.color ?? "accent") as ColorToken}
        size={22}
        containerSize={44}
      />

      <View style={styles.details}>
        <AppText size="md" weight="bold">
          {transaction.title}
        </AppText>
        <AppText size="sm" color="inkDim">
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

      <AppText size="md" weight="black" color={isIncome ? "success" : "danger"}>
        {isIncome ? `+${money}` : `-${money}`}
      </AppText>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14, // spec .rowcard .top gap × device scale
  },
  details: {
    flex: 1,
    gap: 3,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    marginTop: spacing.xs,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
})

export default TransactionRow;
