import type { PipelineStage } from "mongoose";
import Transaction from "../models/Transaction";
import Trip from "../models/Trip";
import { dayKeyInZone } from "../utils/timezone";
import { escapeRegex, TRIPS_CATEGORY } from "./transactionFilter";

/** The built-in category every closed trip counts in; `TRIPS_CATEGORY` is its id, not a Category's. */
export { TRIPS_CATEGORY };
export const TRIPS_NAME = "Trips";

/** The 2.8.6 rule, asked for with `trips=entries`: a closed trip is one expense on its close
 *  date, open trips count nowhere, and none of a trip's own rows count. Without it every read
 *  keeps its 2.8.5 meaning. */
export type TripRule = { entries: boolean; zone: string };

export const closedOnOf = (trip: { closedOn?: string | null; closedAt?: Date | string | null }, zone: string): string | null =>
    trip.closedOn ?? (trip.closedAt ? dayKeyInZone(new Date(trip.closedAt), zone) : null);

/** The close day as text, in the pipeline: a trip closed before 2.8.6 has no `closedOn`. */
const closedOnExpr = (zone: string) => ({
    $ifNull: ["$trip.closedOn", { $dateToString: { date: "$trip.closedAt", format: "%Y-%m-%d", timezone: zone } }],
});

/**
 * One synthetic row per closed trip with a share: `type: "expense"`, `amount` = your share,
 * `category: "trips"`, no account, `tripId` set, `kind: "trip"`. It sits at the last moment of
 * its close day, so it is in that day for every range and first in the day on a newest-first list.
 * `insideMatches` counts the trip's own expense titles that match `search`.
 */
const tripRows = (userId: unknown, zone: string, search?: string): PipelineStage[] => {
    const pattern = search ? { $regexMatch: { input: { $ifNull: ["$title", ""] }, regex: escapeRegex(search), options: "i" } } : false;
    return [
        { $match: { userId, type: "expense", tripId: { $ne: null } } },
        { $group: { _id: "$tripId", amount: { $sum: "$amount" }, insideMatches: { $sum: { $cond: [pattern, 1, 0] } } } },
        // A trip whose whole cost others paid has no entry (no ₹0 rows).
        { $match: { amount: { $gt: 0 } } },
        { $lookup: { from: Trip.collection.collectionName, localField: "_id", foreignField: "_id", as: "trip" } },
        { $unwind: "$trip" },
        { $match: { "trip.status": "closed", "trip.userId": userId } },
        { $addFields: { closedOn: closedOnExpr(zone) } },
        {
            $project: {
                _id: "$_id",
                kind: { $literal: "trip" },
                userId: "$trip.userId",
                type: { $literal: "expense" },
                amount: 1,
                tripId: "$_id",
                category: { $literal: TRIPS_CATEGORY },
                account: { $literal: null },
                toAccount: { $literal: null },
                title: "$trip.name",
                emoji: "$trip.emoji",
                startDate: "$trip.startDate",
                endDate: "$trip.endDate",
                closedOn: 1,
                insideMatches: 1,
                occurredAt: {
                    $subtract: [
                        { $dateAdd: { startDate: { $dateFromString: { dateString: "$closedOn", format: "%Y-%m-%d", timezone: zone } }, unit: "day", amount: 1, timezone: zone } },
                        1,
                    ],
                },
            },
        },
    ];
};

/**
 * The rows every 2.8.6 total reads: everyday rows (no `tripId`) that pass `match`, plus one row
 * per closed trip that passes it. A `title` regex in `match` also lets a trip through when one of
 * its own expenses matches (`insideMatches`). Callers write `match` as they would for the
 * transactions collection, without `tripId`.
 */
export const entryStages = (match: Record<string, unknown>, zone: string, search?: string): PipelineStage[] => {
    const { title, ...rest } = match;
    const onTrip = title !== undefined ? { ...rest, $and: [{ $or: [{ title }, { insideMatches: { $gt: 0 } }] }] } : rest;
    return [
        { $match: { ...match, tripId: null } },
        { $unionWith: { coll: Transaction.collection.collectionName, pipeline: [...tripRows(match.userId, zone, search), { $match: onTrip }] } },
    ] as PipelineStage[];
};

/** The stages a read starts with: plain `$match` under the 2.8.5 rule, `entryStages` under 2.8.6. */
export const rowsFor = (rule: TripRule | undefined, match: Record<string, unknown>): PipelineStage[] =>
    rule?.entries ? entryStages(match, rule.zone) : [{ $match: match }];

export const tripRule = (trips: string | undefined, zone: string): TripRule => ({ entries: trips === "entries", zone });

/** `match` for everyday rows only. Under 2.8.6 a trip is one ordinary expense, so nothing is added. */
export const everydayMatch = (rule: TripRule | undefined, match: Record<string, unknown>): Record<string, unknown> =>
    rule?.entries ? match : { ...match, tripId: null };
