import { Request, Response } from "express";
import Notification from "../models/Notification";
import type { Valid } from "../middleware/validate";
import { listNotificationsSchemas, markNotificationReadSchemas } from "../schemas/notificationSchema";
import { AppError } from "../utils/AppError";
import { notFound } from "../utils/messages";
import { toDTO, toDTOs } from "../utils/dto";
import { paginate } from "../utils/paginate";
import * as reply from "../utils/response";

// The in-app feed behind the bell. It is the source of truth for what has been sent:
// push delivery is best-effort and can be denied outright, so anything the user needs to
// see has to be readable here.

export const listNotifications = async (req: Request, res: Response): Promise<void> => {
    const { query: { page, limit } } = req.valid as Valid<typeof listNotificationsSchemas>;

    const found = await paginate(Notification, { userId: req.user?.userId }, { page, limit, sort: { createdAt: -1 }, lean: true });

    // Counted over the whole collection, not the page — it drives the badge, which is
    // about everything unread rather than everything visible.
    const unread = await Notification.countDocuments({
        userId: req.user?.userId,
        readAt: null
    });

    reply.ok(res, { ...found, items: toDTOs(found.items), unread }, "Notifications fetched");
}

export const markNotificationRead = async (req: Request, res: Response): Promise<void> => {
    const { params: { id } } = req.valid as Valid<typeof markNotificationReadSchemas>;

    // `$ifNull` keeps the first read's timestamp — re-opening a notification is not a new
    // event — while still answering 200 rather than 404 the second time.
    const notification = await Notification.findOneAndUpdate(
        { _id: id, userId: req.user?.userId },
        [{ $set: { readAt: { $ifNull: ["$readAt", new Date()] } } }],
        { new: true }
    ).lean();

    if (!notification) {
        throw AppError.notFound(notFound("notification"));
    }

    const unread = await Notification.countDocuments({
        userId: req.user?.userId,
        readAt: null
    });

    // The new count comes back with it so the bell can settle without a second request.
    reply.ok(res, { notification: toDTO(notification), unread }, "Notification marked as read");
}

export const markAllNotificationsRead = async (req: Request, res: Response): Promise<void> => {
    await Notification.updateMany(
        { userId: req.user?.userId, readAt: null },
        { $set: { readAt: new Date() } }
    );

    reply.ok(res, { unread: 0 }, "Notifications marked as read");
}
