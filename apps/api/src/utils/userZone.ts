import { Request } from "express";
import User from "../models/User";
import { DEFAULT_ZONE, normalizeZone } from "./timezone";

// The zone the request should be bucketed in, read from the user document rather
// than from a header the client sends.
//
// That choice is the whole design: the stored preference is the single source of
// truth, so a month means the same thing whether it was computed for a screen, for
// a CSV export, or by the reminder job at 3am with no request in sight. It also
// means a user who lands in London still sees their Indian month — their money
// didn't move, so their books shouldn't either. Changing zone is then a deliberate
// act in Settings, which is exactly how often it should happen.
//
// One indexed lookup by primary key, projected down to the single field. Callers
// are the handful of controllers that actually bucket, so the endpoints that don't
// (accounts, categories, a single transaction) pay nothing for this.
export const resolveZone = async (req: Request): Promise<string> => {
  if (!req.user?.userId) return DEFAULT_ZONE;

  const user = await User.findById(req.user.userId).select("prefs.timeZone").lean();
  return normalizeZone(user?.prefs?.timeZone);
};
