// The zod schemas behind the five multi-field sheets that used to check by hand (gaps row 118):
// TripSheet, TripExpenseSheet, SettleSheet, EditAccountSheet and EditCategorySheet. Each sheet
// validates through react-hook-form's zodResolver, so every field's problem shows under that
// field at once. Pure, so the rules are tested under node (lib/formSchemas.test.ts).
import { z } from "zod/v4";
import { NAME_MAX, NAME_MIN } from "@save-n-spend/types";

const name = (empty: string) =>
  z.string().trim().min(NAME_MIN, empty).max(NAME_MAX, `Keep it to ${NAME_MAX} characters`);

/** Rupees typed by a person → integer paise; blank is zero, a typo or a negative is null. */
export const rupeesToPaise = (rupees: string): number | null => {
  const trimmed = rupees.trim();
  if (trimmed === "") return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
};

const rupees = (message: string) => z.string().refine((v) => rupeesToPaise(v) !== null, message);

export const categoryFormSchema = z.object({
  name: name("Give the category a name"),
});

export const tripFormSchema = z
  .object({
    name: name("Give the trip a name."),
    start: z.date(),
    end: z.date(),
  })
  .refine((t) => t.end >= t.start, { path: ["end"], message: "The trip can't end before it starts." });

/** `money` formats paise for the message, so this file stays free of the privacy store. */
export const tripExpenseFormSchema = (money: (paise: number) => string) =>
  z
    .object({
      title: z.string().trim().min(1, "Give it a name."),
      cost: z.number({ error: "Enter the amount." }).refine((n) => n > 0, "Enter the amount."),
      shares: z.array(z.object({ amount: z.number() })).min(1, "Tick who it's split between."),
      paidByMe: z.boolean(),
      paidFrom: z.string().nullable(),
    })
    .superRefine((e, ctx) => {
      const assigned = e.shares.reduce((s, x) => s + x.amount, 0);
      if (e.cost > 0 && e.shares.length > 0 && assigned !== e.cost) {
        ctx.addIssue({ code: "custom", path: ["shares"], message: `The shares add up to ${money(assigned)} — they need to make ${money(e.cost)}.` });
      }
      if (e.paidByMe && !e.paidFrom) ctx.addIssue({ code: "custom", path: ["paidFrom"], message: "Pick the account you paid from." });
    });

export const settleFormSchema = z.object({
  amount: z.number({ error: "Enter the amount." }).refine((n) => n > 0, "Enter the amount."),
  account: z.string({ error: "Pick the account." }).min(1, "Pick the account."),
});

export const accountFormSchema = z
  .object({
    name: name("Give the account a name"),
    opening: rupees("Enter the opening balance as a number, or leave it blank for zero."),
    /** The balance correction; blank keeps the balance. */
    actual: rupees("Enter the balance as a number, or leave it blank to keep the one you have."),
    isInvestment: z.boolean(),
    worth: z.string(),
    invested: z.string(),
  })
  .superRefine((a, ctx) => {
    if (!a.isInvestment) return;
    if (rupeesToPaise(a.worth) === null) ctx.addIssue({ code: "custom", path: ["worth"], message: "Enter amounts as numbers, or leave them blank." });
    if (rupeesToPaise(a.invested) === null) ctx.addIssue({ code: "custom", path: ["invested"], message: "Enter amounts as numbers, or leave them blank." });
  });

/** Every problem a schema finds, by its first path segment (the field's name). */
export const fieldProblems = (schema: z.ZodType, values: unknown): Record<string, string> => {
  const parsed = schema.safeParse(values);
  if (parsed.success) return {};
  const out: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
};
