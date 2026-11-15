import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { validate } from "../../middleware/validate";
import { dismissRecurringSuggestion, listRecurringSuggestions } from "../../controllers/recurringController";
import { dismissRecurringSchemas } from "../../schemas/recurringSchema";

const router = Router();

router.get("/", protect, listRecurringSuggestions);
router.post("/dismiss", protect, validate(dismissRecurringSchemas), dismissRecurringSuggestion);

export default router;
