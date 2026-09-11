import Category from "../models/Category";
import { createCategorySchema, reorderSchema, updateCategorySchema } from "../schemas/categorySchema";
import { AppError } from "../utils/AppError";
import * as reply from "../utils/response";
import { Request, Response } from "express"


export const listCategories = async (req: Request, res: Response): Promise<void> => {
    // `order` is only meaningful within a sibling set, so a flat sort by it is not a global
    // ranking — it puts each set in the user's order once the client groups by parent.
    // createdAt breaks the ties everything starts on, keeping never-reordered lists in the
    // order they were built.
    const categories = await Category.find({
        userId: req.user?.userId,
        isArchived: false
    }).sort({ order: 1, createdAt: 1 });

    reply.ok(res, categories, "Categories fetched successfully");
}

export const createCategory = async (req: Request, res: Response): Promise<void> => {
    const reqBody = createCategorySchema.parse(req.body);

    // Category names are unique per user (case-insensitive) — the same name
    // anywhere reads as ambiguous, since rows show the bare name with no parent.
    const duplicate = await Category.findOne({
        userId: req.user?.userId,
        isArchived: false,
        name: reqBody.name
    }).collation({ locale: "en", strength: 2 });

    if (duplicate) {
        throw AppError.badRequest(`A category named "${reqBody.name}" already exists`);
    }

    if (reqBody.parent) {
        const parentCategory = await Category.findOne({
            _id: reqBody.parent,
            userId: req.user?.userId,
            isArchived: false
        });

        if (!parentCategory) {
            throw AppError.notFound("Parent Category not found");
        }

        if (parentCategory.parent != null) {
            throw AppError.badRequest("Categories can only be 2 levels deep");
        }

        // A child's kind must match its parent's. Every total in the app adds a
        // child's spend to its parent's — an income child under an expense parent
        // would fold earnings into a spending figure, in the breakdown, in the
        // budget bar, and in the alert that fires off the back of it.
        if (parentCategory.kind !== reqBody.kind) {
            throw AppError.badRequest(
                `"${parentCategory.name}" is an ${parentCategory.kind} category, so its sub-categories must be too`
            );
        }
    }

    // Lands last among its siblings rather than at 0, which on a list the user has already
    // ordered would put their newest category at the top.
    const siblings = await Category.countDocuments({
        userId: req.user?.userId,
        isArchived: false,
        kind: reqBody.kind,
        parent: reqBody.parent ?? null
    });

    const savedCategory = await Category.create({
        userId: req.user?.userId,
        name: reqBody.name,
        kind: reqBody.kind,
        parent: reqBody.parent ?? null,
        icon: reqBody.icon ?? "wallet",
        color: reqBody.color ?? "success",
        order: siblings
    });

    reply.created(res, savedCategory, "Category created successfully");
}

export const getCategory = async (req: Request, res: Response): Promise<void> => {
    const { id: categoryId } = req.params;

    const category = await Category.findOne({
        _id: categoryId,
        userId: req.user?.userId,
        isArchived: false
    });

    if (!category) {
        throw AppError.notFound("Category not found");
    }

    reply.ok(res, category, "Category fetched successfully");
}

export const updateCategory = async (req: Request, res: Response): Promise<void> => {
    const { id: categoryId } = req.params;
    const reqBody = updateCategorySchema.parse(req.body);

    const category = await Category.findOne({
        _id: categoryId,
        userId: req.user?.userId,
        isArchived: false
    });

    if (!category) {
        throw AppError.notFound("Category not found");
    }

    if (reqBody.name) {
        const duplicate = await Category.findOne({
            userId: req.user?.userId,
            isArchived: false,
            _id: { $ne: categoryId },
            name: reqBody.name
        }).collation({ locale: "en", strength: 2 });

        if (duplicate) {
            throw AppError.badRequest(`A category named "${reqBody.name}" already exists`);
        }
    }

    Object.assign(category, reqBody);

    const updatedCategory = await category.save();

    reply.ok(res, updatedCategory, "Category details updated");
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
    const { ids } = reorderSchema.parse(req.body);

    if (new Set(ids).size !== ids.length) {
        throw AppError.badRequest("The same category was listed twice");
    }

    const owned = await Category.countDocuments({
        _id: { $in: ids },
        userId: req.user?.userId,
        isArchived: false
    });

    if (owned !== ids.length) {
        throw AppError.badRequest("Some of those categories no longer exist");
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
    const { id: categoryId } = req.params;

    const category = await Category.findOne({
        _id: categoryId,
        userId: req.user?.userId,
        isArchived: false
    });

    if (!category) {
        throw AppError.notFound("Category not found");
    }

    category.isArchived = true;

    await category.save();

    // Archiving a parent takes its children with it. Leaving them behind would strand
    // rows pointing at a parent the list endpoint no longer returns — the picker would
    // show a child with no group, and the rollup would key spend to a name nothing can
    // resolve. Their transactions are untouched either way; this only hides them from
    // the pickers, which is all archiving ever meant.
    const archivedChildren = category.parent === null
        ? await Category.updateMany(
            { userId: req.user?.userId, parent: category._id, isArchived: false },
            { $set: { isArchived: true } }
        )
        : null;

    reply.ok(res, { archivedChildren: archivedChildren?.modifiedCount ?? 0 }, "Category deleted successfully");
}
