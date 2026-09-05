import Category from "../models/Category";
import { createCategorySchema, updateCategorySchema } from "../schemas/categorySchema";
import { AppError } from "../utils/AppError";
import * as reply from "../utils/response";
import { Request, Response } from "express"


export const listCategories = async (req: Request, res: Response): Promise<void> => {
    const categories = await Category.find({
        userId: req.user?.userId,
        isArchived: false
    });

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

    const savedCategory = await Category.create({
        userId: req.user?.userId,
        name: reqBody.name,
        kind: reqBody.kind,
        parent: reqBody.parent ?? null,
        icon: reqBody.icon ?? "wallet",
        color: reqBody.color ?? "success"
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
