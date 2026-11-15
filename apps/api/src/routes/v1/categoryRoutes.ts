import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { validate } from "../../middleware/validate";
import { withIdempotency } from "../../middleware/idempotency";
import { archiveCategory, createCategory, getCategory, listCategories, reorderCategories, updateCategory } from "../../controllers/categoryController";
import { categoryIdSchemas, createCategorySchemas, reorderCategoriesSchemas, updateCategorySchemas } from "../../schemas/categorySchema";

const router = Router();

router.get('/', protect, listCategories);
router.post('/', protect, validate(createCategorySchemas), withIdempotency(), createCategory);
// Above PATCH /:id, which would otherwise match "reorder" as an id.
router.patch('/reorder', protect, validate(reorderCategoriesSchemas), reorderCategories);
router.get('/:id', protect, validate(categoryIdSchemas), getCategory);
router.patch('/:id', protect, validate(updateCategorySchemas), updateCategory);
router.delete('/:id', protect, validate(categoryIdSchemas), archiveCategory);

export default router;
