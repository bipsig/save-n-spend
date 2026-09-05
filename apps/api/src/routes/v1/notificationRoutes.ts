import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../../controllers/notificationController";

const router = Router();

router.get("/", protect, listNotifications);
// POST, not PATCH: it isn't editing a resource the client named, it is an action on the
// whole feed — and it has to come before "/:id/read" would ever shadow it.
router.post("/read-all", protect, markAllNotificationsRead);
router.patch("/:id/read", protect, markNotificationRead);

export default router;
