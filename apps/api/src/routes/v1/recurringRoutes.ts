import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { dismissRecurringSuggestion, listRecurringSuggestions } from "../../controllers/recurringController";

const router = Router();

router.get("/", protect, listRecurringSuggestions);
router.post("/dismiss", protect, dismissRecurringSuggestion);

export default router;
