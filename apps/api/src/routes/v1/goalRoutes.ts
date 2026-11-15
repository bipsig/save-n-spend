import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { validate } from "../../middleware/validate";
import { createGoal, deleteGoal, listGoals, contributeGoal, updateGoal } from "../../controllers/goalController";
import { contributeGoalSchemas, createGoalSchemas, goalIdSchemas, updateGoalSchemas } from "../../schemas/goalSchema";

const router = Router();

router.get("/", protect, listGoals);
router.post("/", protect, validate(createGoalSchemas), createGoal);
router.patch("/:id", protect, validate(updateGoalSchemas), updateGoal);
router.delete("/:id", protect, validate(goalIdSchemas), deleteGoal);
router.post("/:id/contribute", protect, validate(contributeGoalSchemas), contributeGoal);

export default router;
