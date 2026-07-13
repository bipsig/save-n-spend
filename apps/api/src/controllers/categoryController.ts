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

    reply.ok(res, null, "Category deleted successfully");
}
