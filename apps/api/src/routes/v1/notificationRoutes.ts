import { Router } from "express";
import { protect } from "../../middleware/authMiddleware";
import { validate } from "../../middleware/validate";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../../controllers/notificationController";
import { listNotificationsSchemas, markAllNotificationsReadSchemas, markNotificationReadSchemas } from "../../schemas/notificationSchema";

const router = Router();

router.get("/", protect, validate(listNotificationsSchemas), listNotifications);
// POST, not PATCH: it isn't editing a resource the client named, it is an action on the
// whole feed — and it has to come before "/:id/read" would ever shadow it.
router.post("/read-all", protect, validate(markAllNotificationsReadSchemas), markAllNotificationsRead);
router.patch("/:id/read", protect, validate(markNotificationReadSchemas), markNotificationRead);

export default router;
