import { Request, Response } from "express";
import Notification from "../models/Notification";
import { listNotificationQuerySchema } from "../schemas/notificationSchema";
import { AppError } from "../utils/AppError";
import * as reply from "../utils/response";

// The in-app feed behind the bell. It is the source of truth for what has been sent:
// push delivery is best-effort and can be denied outright, so anything the user needs to
// see has to be readable here.

export const listNotifications = async (req: Request, res: Response): Promise<void> => {
    const { page, limit } = listNotificationQuerySchema.parse(req.query);

    // One extra row rather than a second count query: all `hasNextPage` needs to know is
    // whether anything follows this page.
    const rows = await Notification.find({ userId: req.user?.userId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit + 1)
        .lean();

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;

    // Counted over the whole collection, not the page — it drives the badge, which is
    // about everything unread rather than everything visible.
    const unread = await Notification.countDocuments({
        userId: req.user?.userId,
        readAt: null
    });

    reply.ok(res, { items, unread, page, hasNextPage }, "Notifications fetched successfully");
}

export const markNotificationRead = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    // `$ifNull` keeps the first read's timestamp — re-opening a notification is not a new
    // event — while still answering 200 rather than 404 the second time.
    const notification = await Notification.findOneAndUpdate(
        { _id: id, userId: req.user?.userId },
        [{ $set: { readAt: { $ifNull: ["$readAt", new Date()] } } }],
        { new: true }
    ).lean();

    if (!notification) {
        throw AppError.notFound("Notification not found");
    }

    const unread = await Notification.countDocuments({
        userId: req.user?.userId,
        readAt: null
    });

    // The new count comes back with it so the bell can settle without a second request.
    reply.ok(res, { notification, unread }, "Notification marked as read");
}

export const markAllNotificationsRead = async (req: Request, res: Response): Promise<void> => {
    await Notification.updateMany(
        { userId: req.user?.userId, readAt: null },
        { $set: { readAt: new Date() } }
    );

    reply.ok(res, { unread: 0 }, "All notifications marked as read");
}
