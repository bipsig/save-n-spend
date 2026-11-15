import { z } from "./z";
import { month, objectId, positiveMoney } from "./fields";

const budgetId = z.object({ id: objectId("Budget") });

export const listBudgetsSchemas = { query: z.object({ month: month.optional() }) };

export const createBudgetSchemas = {
    body: z.object({
        category: objectId("Category", "categories"),
        month,
        limit: positiveMoney,
    }).strict(),
};

export const updateBudgetSchemas = { params: budgetId, body: z.object({ limit: positiveMoney }).strict() };

export const budgetIdSchemas = { params: budgetId };
