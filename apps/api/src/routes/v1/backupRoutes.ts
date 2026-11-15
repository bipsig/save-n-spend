import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { restoreLimiter } from "../../middleware/rateLimiter";
import { validate } from "../../middleware/validate";
import { getBackup, restoreBackup } from "../../controllers/backupController";
import { restoreSchemas } from "../../schemas/backupSchema";

const router = Router();

router.get("/", protect, getBackup);
// The limiter after protect, so requests without a valid session don't use up the hour's
// restores.
router.post("/restore", protect, restoreLimiter, validate(restoreSchemas), restoreBackup);

export default router;
