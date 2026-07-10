import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import { z } from "zod/v4";
import { parseMoney } from "@/lib/money";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { categories } from "@/lib/categories";
import { defaultAccountId } from "@/lib/mock";
import Chip from "@/components/ui/Chip";
import { spacing } from "@/theme";

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  amount: z
    .string()
    .regex(/^\s*₹?\s*[\d,]+(\.\d{1,2})?\s*$/, "Enter a valid amount")
    .refine((v) => parseMoney(v) > 0, "Enter a valid amount"),
  type: z.enum(["income", "expense"]),
  category: z
    .string()
    .refine((c) => categories.some((cat) => cat._id === c), "Select a category"),
});

type FormValues = z.infer<typeof schema>

const AddTransaction = () => {
  const router = useRouter();
  const { control, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", amount: "", category: "", type: "expense" }
  })

  const onSubmit = (data: FormValues) => {
    // Build a payload shaped like ITransaction: positive amount, `type` gives direction.
    const newTransaction = {
      type: data.type,
      amount: parseMoney(data.amount), // paise, positive
      category: data.category,
      account: defaultAccountId,
      title: data.title,
      occurredAt: new Date().toISOString(),
    };
    console.log(newTransaction);
    router.back();
  }

  const header = (
    <View style={styles.header}>
      <AppText weight="black" size="2xl">
        Add Transaction
      </AppText>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Icon name="close" container="circle" containerColor="surface2" color="gray700" />
      </Pressable>
    </View>
  );

  return (
    <ScreenScaffold header={header}>
      {/* Income / Expense */}
      <Controller
        control={control}
        name="type"
        render={({ field: { value, onChange } }) => (
          <View style={styles.field}>
            <AppText size="sm" weight="bold" color="gray700">Type</AppText>
            <View style={styles.row}>
              <Chip
                label="Expense"
                selected={value === "expense"}
                onPress={() => onChange("expense")}
              />
              <Chip
                label="Income"
                selected={value === "income"}
                onPress={() => onChange("income")}
              />
            </View>
          </View>
        )}
      />

      <Controller
        control={control}
        name="title"
        render={({ field: { value, onChange, onBlur } }) => (
          <Input
            label="Title"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.title?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="amount"
        render={({ field: { value, onChange, onBlur } }) => (
          <Input
            label="Amount"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.amount?.message}
            keyboardType="decimal-pad"
          />
        )}
      />

      {/* Category */}
      <Controller
        control={control}
        name="category"
        render={({ field: { value, onChange } }) => (
          <View style={styles.field}>
            <AppText size="sm" weight="bold" color="gray700">Category</AppText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroll}
              contentContainerStyle={styles.row}
            >
              {categories.map((category) => (
                <Chip
                  key={category._id}
                  label={category.name}
                  selected={value === category._id}
                  onPress={() => onChange(category._id)}
                />
              ))}
            </ScrollView>
            {errors.category && (
              <AppText size="xs" color="danger">{errors.category.message}</AppText>
            )}
          </View>
        )}
      />

      <Button onPress={handleSubmit(onSubmit)} label="Save" />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  field: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  chipScroll: {
    flexGrow: 0,
  },
});

export default AddTransaction;
