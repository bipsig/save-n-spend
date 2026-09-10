import { Request } from "express";
import User from "../models/User";
import { DEFAULT_ZONE, normalizeZone } from "./timezone";

// The zone the request is bucketed in, read from the user document rather than a header the
// client sends. The stored preference is the single source of truth, so a month means the same
// thing on a screen, in a CSV export, and in the reminder job with no request in sight — and a
// user who lands in London still sees their Indian month, because their money didn't move.
//
// One indexed lookup by primary key, projected to the single field. Only the controllers that
// actually bucket call it, so the rest pay nothing.
export const resolveZone = async (req: Request): Promise<string> => {
  if (!req.user?.userId) return DEFAULT_ZONE;

  const user = await User.findById(req.user.userId).select("prefs.timeZone").lean();
  return normalizeZone(user?.prefs?.timeZone);
};
