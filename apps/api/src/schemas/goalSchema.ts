import { z } from "./z";
import { lenientDate as day, name, objectId, positiveMoney } from "./fields";


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
