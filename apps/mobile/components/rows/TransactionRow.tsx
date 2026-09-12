import { StyleSheet, View } from "react-native"
import PressableScale from "../ui/PressableScale"
import { useAccountById } from "@/lib/accounts"
import { useCategoryById } from "@/lib/categories"
import type { ITransaction } from "@save-n-spend/types"
import type { IconName } from "@/lib/icons"
import type { ColorToken } from "@/theme"
import { spacing } from "@/theme"
import { formatTxnDate } from "@/lib/date"
import Icon from "../ui/Icon"
import CategoryName from "../ui/CategoryName"
import { AppText } from "../ui/AppText"
import Card from "../data/Card"
import Money from "../ui/Money"

type Props = {
  transaction: ITransaction,
  onPress?: () => void
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
const TransactionRow = ({ transaction, onPress }: Props) => {
  const category = useCategoryById(transaction.category)
  const isIncome = transaction.type === "income"

  // A transfer carries no title and no category (see add-transaction), so the ordinary
  // row rendered it as a blank name over "Uncategorised" with a red minus — three
  // statements that were all wrong. Its two accounts are the whole of what it says.
  const isTransfer = transaction.type === "transfer"
  const from = useAccountById(transaction.account)
  const to = useAccountById(transaction.toAccount)

  return (
    // `disabled` when there's no handler, so a row that leads nowhere doesn't dip or
    // buzz and promise a detail sheet that isn't coming.
    <PressableScale onPress={onPress} disabled={!onPress} scaleTo={0.98}>
      <Card style={styles.card}>
        <Icon
          name={isTransfer ? "transfer" : ((category?.icon ?? "more") as IconName)}
          container="square"
          // Teal, which is neither the green of money in nor the red of money out.
          gradient={isTransfer ? "teal" : ((category?.color ?? "accent") as ColorToken)}
          size={22}
          containerSize={44}
        />

        <View style={styles.details}>
          <AppText size="md" weight="bold">
            {isTransfer ? "Transfer" : transaction.title}
          </AppText>
          {isTransfer ? (
            <AppText size="sm" color="inkDim">
              {`${from?.name ?? "Account"} → ${to?.name ?? "Account"}`}
            </AppText>
          ) : (
            // Not the bare name: a row reading "Groceries" gives no hint that its spend
            // also lands in "Food & Dining", and two rows under different parents can
            // otherwise look like the same category.
            <CategoryName categoryId={transaction.category} size="sm" weight="regular" color="inkDim" />
          )}
          <View style={styles.metaRow}>
            <MetaItem icon="date" label={formatTxnDate(transaction.occurredAt)} />
            {transaction.location && (
              <MetaItem icon="location" label={transaction.location} />
            )}
            {transaction.receiptUrl && (
              <MetaItem icon="receipt" label="Receipt" color="primary" />
            )}
            {/* Set on both the expense (the user's share) and its sibling transfers, so
                a split reads as one event wherever a piece of it shows up in Activity. */}
            {transaction.splitGroupId && (
              <MetaItem icon="person" label="Split" />
            )}
          </View>
        </View>

        {/* The amount is stored positive and the type supplies the sign. A transfer gets
            neither sign nor colour — nothing was earned or spent, and the totals above
            don't count it. While privacy mode is masking, this is also the row's peek
            target — one tap reveals every amount in the app, and from then on taps here
            open the detail sheet like anywhere else on the row. */}
        <Money
          value={transaction.amount}
          prefix={isTransfer ? "" : isIncome ? "+" : "-"}
          size="md"
          weight="black"
          color={isTransfer ? "inkDim" : isIncome ? "success" : "danger"}
        />
      </Card>
    </PressableScale>
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
