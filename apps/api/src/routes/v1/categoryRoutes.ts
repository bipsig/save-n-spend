import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { archiveCategory, createCategory, getCategory, listCategories, updateCategory } from "../../controllers/categoryController";

const router = Router();

router.get('/', protect, listCategories);
router.post('/', protect, createCategory);
router.get('/:id', protect, getCategory);
router.patch('/:id', protect, updateCategory);
router.delete('/:id', protect, archiveCategory);

export default router;