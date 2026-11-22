import { Request, Response } from "express";
import * as reply from "../utils/response";
import { resolveZone } from "../utils/userZone";
import { toDTO } from "../utils/dto";
import type { Valid } from "../middleware/validate";
import type {
    addExpenseSchemas, closeDateSchemas, closeTripSchemas, createTripSchemas, editExpenseSchemas, expenseIdSchemas, importCommitSchemas,
    importPreviewSchemas, planSchemas, settleSchemas, tripIdSchemas, updateTripSchemas,
} from "../schemas/tripSchema";
import { commitImport, previewImport } from "../services/tripImportService";
import {
    addTripExpense, changeCloseDate, clearPlan, closeTrip, createTrip, deleteTrip, deleteTripExpense, getTripDetail, listTrips,
    reopenTrip, savePlan, settleUp, tripReply, updateTrip, updateTripExpense,
} from "../services/tripService";
import { ifMatch } from "../utils/precondition";

// Create, update and close-date answer the list's trip shape plus `updatedAt` (tripReply). What
// the apps read from them: `_id` from a create (2.6.0 on), `updatedAt` for an edit's undo (2.8.7).

const uid = (req: Request) => req.user!.userId;

export const list = async (req: Request, res: Response) => reply.ok(res, await listTrips(uid(req), await resolveZone(req)), "Trips fetched");

export const detail = async (req: Request, res: Response) => {
    const { params } = req.valid as Valid<typeof tripIdSchemas>;
    reply.ok(res, await getTripDetail(uid(req), params.id, await resolveZone(req)), "Trip fetched");
};

export const create = async (req: Request, res: Response) => {
    const { body } = req.valid as Valid<typeof createTripSchemas>;
    const trip = await createTrip(uid(req), body);
    reply.created(res, tripReply(trip, await resolveZone(req)), "Trip created");
};

export const update = async (req: Request, res: Response) => {
    const { params, body } = req.valid as Valid<typeof updateTripSchemas>;
    const trip = await updateTrip(uid(req), params.id, body, ifMatch(req));
    reply.ok(res, tripReply(trip, await resolveZone(req)), "Trip updated");
};

export const remove = async (req: Request, res: Response) => {
    const { params } = req.valid as Valid<typeof tripIdSchemas>;
    await deleteTrip(uid(req), params.id);
    reply.ok(res, null, "Trip deleted");
};

export const addExpense = async (req: Request, res: Response) => {
    const { params, body } = req.valid as Valid<typeof addExpenseSchemas>;
    reply.created(res, toDTO(await addTripExpense(uid(req), params.id, body)), "Expense added");
};

export const editExpense = async (req: Request, res: Response) => {
    const { params, body } = req.valid as Valid<typeof editExpenseSchemas>;
    reply.ok(res, toDTO(await updateTripExpense(uid(req), params.id, params.expenseId, body, ifMatch(req))), "Expense updated");
};

export const removeExpense = async (req: Request, res: Response) => {
    const { params } = req.valid as Valid<typeof expenseIdSchemas>;
    await deleteTripExpense(uid(req), params.id, params.expenseId);
    reply.ok(res, null, "Expense deleted");
};

export const settle = async (req: Request, res: Response) => {
    const { params, body } = req.valid as Valid<typeof settleSchemas>;
    const outcome = await settleUp(uid(req), params.id, body);
    reply.ok(res, null, outcome === "replayed" ? "Settle-up already saved" : "Settle-up saved");
};

export const close = async (req: Request, res: Response) => {
    const { params, body } = req.valid as Valid<typeof closeTripSchemas>;
    await closeTrip(uid(req), params.id, body.letGo, await resolveZone(req), body.closedOn);
    reply.ok(res, null, "Trip closed");
};

export const closeDate = async (req: Request, res: Response) => {
    const { params, body } = req.valid as Valid<typeof closeDateSchemas>;
    const since = ifMatch(req);
    const trip = await changeCloseDate(uid(req), params.id, body.closedOn, await resolveZone(req), since);
    // `data` was null before 2.8.7; the trip is sent now for its `updatedAt` (the app's Undo).
    reply.ok(res, tripReply(trip, await resolveZone(req)), "Close date saved");
};

export const reopen = async (req: Request, res: Response) => {
    const { params } = req.valid as Valid<typeof tripIdSchemas>;
    await reopenTrip(uid(req), params.id);
    reply.ok(res, null, "Trip reopened");
};

export const putPlan = async (req: Request, res: Response) => {
    const { params, body } = req.valid as Valid<typeof planSchemas>;
    await savePlan(uid(req), params.id, body.entries);
    reply.ok(res, null, "Plan saved");
};

export const removePlan = async (req: Request, res: Response) => {
    const { params } = req.valid as Valid<typeof tripIdSchemas>;
    await clearPlan(uid(req), params.id);
    reply.ok(res, null, "Plan cleared");
};

export const importPreview = async (req: Request, res: Response) => {
    const { params, body } = req.valid as Valid<typeof importPreviewSchemas>;
    reply.ok(res, await previewImport(uid(req), params.id, body.csv, body.mapping), "Import previewed");
};

export const importCommit = async (req: Request, res: Response) => {
    const { params, body } = req.valid as Valid<typeof importCommitSchemas>;
    reply.ok(res, await commitImport(uid(req), params.id, body.csv, body.mapping, body.decisions), "Import saved");
};
