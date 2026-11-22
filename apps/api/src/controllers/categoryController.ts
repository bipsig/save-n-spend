import Category from "../models/Category";
import type { Valid } from "../middleware/validate";
import { categoryIdSchemas, createCategorySchemas, listCategoriesSchemas, reorderCategoriesSchemas, updateCategorySchemas } from "../schemas/categorySchema";
import { AppError } from "../utils/AppError";
import { inTransaction } from "../utils/inTransaction";
import { notFound } from "../utils/messages";
import { toDTO, toDTOs } from "../utils/dto";
import * as reply from "../utils/response";
import { Request, Response } from "express"
import { TRIPS_NAME } from "../services/tripEntries";

/** The rule scripts/buildCategoryIndex.ts builds its unique index on: one live category per
 *  kind, parent and name, names compared without case. The app-side check below is stricter
 *  on purpose: one live name per user, because rows show the bare name. */
export const CATEGORY_NAME_COLLATION = { locale: "en", strength: 2 } as const;

const duplicateName = () => AppError.duplicate("a category with that name");
const isDuplicateKey = (err: unknown) => (err as { code?: number } | null)?.code === 11000;

/** Trips is built in: no category may take its name. A category already called that keeps it. */
export const isReservedName = (name: string) => name.trim().toLowerCase() === TRIPS_NAME.toLowerCase();
const RESERVED = `${TRIPS_NAME} is a built-in category`;
const reservedName = () => new AppError(400, RESERVED, { code: "invalid_input", issues: [{ path: "name", message: RESERVED }] });

const sameNameExists = (userId: string, name: string, except?: string) =>
    Category.exists({
        userId,
        isArchived: false,
        name,
        ...(except ? { _id: { $ne: except } } : {})
    }).collation(CATEGORY_NAME_COLLATION);

export const listFilter = (userId: string | undefined, include: "archived" | undefined) =>
    include === "archived" ? { userId } : { userId, isArchived: false };

export const listCategories = async (req: Request, res: Response): Promise<void> => {
    const { query } = req.valid as Valid<typeof listCategoriesSchemas>;
    // `order` is only meaningful within a sibling set, so a flat sort by it is not a global
    // ranking — it puts each set in the user's order once the client groups by parent.
    // createdAt breaks the ties everything starts on, keeping never-reordered lists in the
    // order they were built.
    const categories = await Category.find(listFilter(req.user?.userId, query.include))
        .sort({ order: 1, createdAt: 1 });

    reply.ok(res, toDTOs(categories), "Categories fetched");
}

export const createCategory = async (req: Request, res: Response): Promise<void> => {
    const { body } = req.valid as Valid<typeof createCategorySchemas>;
    const userId = req.user!.userId;

    if (body.parent) {
        const parentCategory = await Category.findOne({
            _id: body.parent,
            userId,
            isArchived: false
        });

        if (!parentCategory) {
            throw AppError.invalidReference("parent", "Parent category", "categories");
        }

        if (parentCategory.parent != null) {
            throw AppError.badRequest("Categories can only be 2 levels deep");
        }

        // A child's kind must match its parent's. Every total in the app adds a
        // child's spend to its parent's — an income child under an expense parent
        // would fold earnings into a spending figure, in the breakdown, in the
        // budget bar, and in the alert that fires off the back of it.
        if (parentCategory.kind !== body.kind) {
            throw AppError.badRequest("A sub-category has to be the same kind as its parent");
        }
    }

    if (isReservedName(body.name)) throw reservedName();
    if (await sameNameExists(userId, body.name)) {
        throw duplicateName();
    }

    // Lands last among its siblings rather than at 0, which on a list the user has already
    // ordered would put their newest category at the top.
    const siblings = await Category.countDocuments({
        userId,
        isArchived: false,
        kind: body.kind,
        parent: body.parent ?? null
    });

    let savedCategory;
    try {
        // In a transaction so a sent Idempotency-Key is recorded with the category (utils/inTransaction).
        [savedCategory] = await inTransaction((session) => Category.create([{
            userId,
            name: body.name,
            kind: body.kind,
            parent: body.parent ?? null,
            icon: body.icon ?? "wallet",
            color: body.color ?? "success",
            order: siblings
        }], { session }));
    }
    catch (err) {
        // Two creates at once: the unique index (once built) stops the second.
        if (isDuplicateKey(err)) throw duplicateName();
        throw err;
    }

    reply.created(res, toDTO(savedCategory), "Category created");
}

export const getCategory = async (req: Request, res: Response): Promise<void> => {
    const { params: { id } } = req.valid as Valid<typeof categoryIdSchemas>;

    const category = await Category.findOne({
        _id: id,
        userId: req.user?.userId,
        isArchived: false
    });

    if (!category) {
        throw AppError.notFound(notFound("category"));
    }

    reply.ok(res, toDTO(category), "Category fetched");
}

export const updateCategory = async (req: Request, res: Response): Promise<void> => {
    const { params: { id }, body } = req.valid as Valid<typeof updateCategorySchemas>;
    const userId = req.user!.userId;

    const category = await Category.findOne({
        _id: id,
        userId,
        isArchived: false
    });

    if (!category) {
        throw AppError.notFound(notFound("category"));
    }

    if (body.name && isReservedName(body.name) && !isReservedName(category.name)) throw reservedName();
    if (body.name && await sameNameExists(userId, body.name, id)) {
        throw duplicateName();
    }

    Object.assign(category, body);

    let updatedCategory;
    try {
        updatedCategory = await category.save();
    }
    catch (err) {
        if (isDuplicateKey(err)) throw duplicateName();
        throw err;
    }

    reply.ok(res, toDTO(updatedCategory), "Category updated");
}

/**
 * Writes one sibling set's order — the top-level categories of a kind, or one parent's
 * children. Nothing here reads `parent` or `kind`: the client sends a set it already has
 * grouped, and `order` is only ever compared inside such a set, so a stray id from another
 * set would rank itself against numbers it is never compared with.
 *
 * Every id must resolve to one of the user's live categories, and the request must carry the
 * whole set. A partial list would leave the rows it omits on numbers that collide with the
 * ones it sets, and the result would depend on the createdAt tiebreak rather than on what the
 * user just did.
 */
export const reorderCategories = async (req: Request, res: Response): Promise<void> => {
    const { body: { ids } } = req.valid as Valid<typeof reorderCategoriesSchemas>;

    if (new Set(ids).size !== ids.length) {
        throw AppError.badRequest("The same category was listed twice");
    }

    const owned = await Category.countDocuments({
        _id: { $in: ids },
        userId: req.user?.userId,
        isArchived: false
    });

    if (owned !== ids.length) {
        throw AppError.invalidReference("ids", "A category in the list", "categories");
    }

    await Category.bulkWrite(ids.map((id, index) => ({
        updateOne: {
            filter: { _id: id, userId: req.user?.userId },
            update: { $set: { order: index } }
        }
    })));

    reply.ok(res, { reordered: ids.length }, "Categories reordered");
}

export const archiveCategory = async (req: Request, res: Response): Promise<void> => {
    const { params: { id } } = req.valid as Valid<typeof categoryIdSchemas>;
    const userId = req.user!.userId;

    // Archiving a parent takes its children with it. Leaving them behind would strand
    // rows pointing at a parent the list endpoint no longer returns — the picker would
    // show a child with no group, and the rollup would key spend to a name nothing can
    // resolve. Their transactions are untouched either way; this only hides them from
    // the pickers, which is all archiving ever meant. Both writes commit together, so a
    // failure can't leave live children under an archived parent.
    const archivedChildren = await inTransaction(async (session) => {
        const category = await Category.findOneAndUpdate(
            { _id: id, userId, isArchived: false },
            { $set: { isArchived: true } },
            { new: true, session }
        );

        if (!category) {
            throw AppError.notFound(notFound("category"));
        }

        if (category.parent !== null) return 0;

        const children = await Category.updateMany(
            { userId, parent: category._id, isArchived: false },
            { $set: { isArchived: true } },
            { session }
        );
        return children.modifiedCount;
    });

    reply.ok(res, { archivedChildren }, "Category archived");
}
