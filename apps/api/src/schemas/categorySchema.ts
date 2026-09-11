import z from "zod";

export const createCategorySchema = z.object({
    name: z.string().min(1).trim(),
    kind: z.enum(["expense", "income"]),
    parent: z.string().optional(),
    icon: z.string().optional(),
    color: z.string().optional()
}).strict();

export const updateCategorySchema = z.object({
    name: z.string().min(1).trim().optional(),
    icon: z.string().optional(),
    color: z.string().optional()
}).strict();

// One sibling set in the order the user just left it in, front to back. Not a single
// `{ id, order }`: moving one row shifts everything after it, so a whole-set write is
// both fewer requests and the only version that can't end up with two rows claiming
// the same slot.
export const reorderSchema = z.object({
    ids: z.array(z.string()).min(1)
}).strict();