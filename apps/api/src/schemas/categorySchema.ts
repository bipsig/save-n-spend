import { z } from "./z";
import { name, objectId } from "./fields";
import { CATEGORY_KINDS } from "../constants";

const categoryName = name("Name");

const categoryId = z.object({ id: objectId("Category") });

// `include=archived` (2.8.0 on) adds archived categories, so rows filed under one can still
// print its name. Without it the list is live categories only, as the 2.6.0 app expects.
export const listCategoriesSchemas = {
    query: z.object({ include: z.enum(["archived"]).optional() }),
};

export const createCategorySchemas = {
    body: z.object({
        name: categoryName,
        kind: z.enum(CATEGORY_KINDS),
        parent: objectId("Parent category", "categories").optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
    }).strict(),
};

export const updateCategorySchemas = {
    params: categoryId,
    body: z.object({
        name: categoryName.optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
    }).strict(),
};

export const categoryIdSchemas = { params: categoryId };

// One sibling set in the order the user just left it in, front to back. Not a single
// `{ id, order }`: moving one row shifts everything after it, so a whole-set write is
// both fewer requests and the only version that can't end up with two rows claiming
// the same slot.
export const reorderCategoriesSchemas = {
    body: z.object({
        ids: z.array(objectId("A category in the list", "categories")).min(1),
    }).strict(),
};
