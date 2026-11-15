import { z } from "./z";
import { name, objectId, positiveMoney } from "./fields";

/** Any text or number `new Date()` reads, as before. `null` is kept as null by `.nullable()`
 *  (`z.coerce.date()` turned it into 1 January 1970). */
const day = z.preprocess((v) => (typeof v === "string" || typeof v === "number" ? new Date(v) : v), z.date());

const fields = {
    name: name("Name"),
    target: positiveMoney,
    icon: z.string().optional(),
    color: z.string().optional(),
    deadline: day.nullable().optional(),
};

const goalId = z.object({ id: objectId("Goal") });

export const createGoalSchemas = { body: z.object(fields).strict() };

export const updateGoalSchemas = { params: goalId, body: z.object(fields).partial().strict() };

export const goalIdSchemas = { params: goalId };

export const contributeGoalSchemas = { params: goalId, body: z.object({ amount: positiveMoney }).strict() };
