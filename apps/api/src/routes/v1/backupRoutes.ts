import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { restoreLimiter } from "../../middleware/rateLimiter";
import { getBackup, restoreBackup } from "../../controllers/backupController";

const router = Router();

router.get("/", protect, getBackup);
router.post("/restore", restoreLimiter, protect, restoreBackup);

export default router;
