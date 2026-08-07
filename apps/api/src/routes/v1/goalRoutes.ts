import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { createGoal, deleteGoal, listGoals, contributeGoal, updateGoal } from "../../controllers/goalController";

const router = Router();

router.get("/", protect, listGoals);
router.post("/", protect, createGoal);
router.patch("/:id", protect, updateGoal);
router.delete("/:id", protect, deleteGoal);
router.post("/:id/contribute", protect, contributeGoal);

export default router;
