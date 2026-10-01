import { Request, Response } from "express";
import * as reply from "../utils/response";
import { resolveZone } from "../utils/userZone";
import { closeTripSchema, importCommitSchema, importPreviewSchema, settleSchema, tripExpenseSchema, tripSchema, updateTripSchema } from "../schemas/tripSchema";
import { commitImport, previewImport } from "../services/tripImportService";
import {
    addTripExpense, closeTrip, createTrip, deleteTrip, deleteTripExpense, getTripDetail, listTrips,
    reopenTrip, settleUp, updateTrip, updateTripExpense,
} from "../services/tripService";

const uid = (req: Request) => req.user!.userId;

export const list = async (req: Request, res: Response) => reply.ok(res, await listTrips(uid(req)), "Trips fetched");

export const detail = async (req: Request, res: Response) =>
    reply.ok(res, await getTripDetail(uid(req), req.params.id, await resolveZone(req)), "Trip fetched");

export const create = async (req: Request, res: Response) =>
    reply.created(res, await createTrip(uid(req), tripSchema.parse(req.body)), "Trip created");

export const update = async (req: Request, res: Response) =>
    reply.ok(res, await updateTrip(uid(req), req.params.id, updateTripSchema.parse(req.body)), "Trip updated");

export const remove = async (req: Request, res: Response) => {
    await deleteTrip(uid(req), req.params.id);
    reply.ok(res, null, "Trip deleted");
};

export const addExpense = async (req: Request, res: Response) =>
    reply.created(res, await addTripExpense(uid(req), req.params.id, tripExpenseSchema.parse(req.body)), "Expense added");

export const editExpense = async (req: Request, res: Response) =>
    reply.ok(res, await updateTripExpense(uid(req), req.params.id, req.params.expenseId, tripExpenseSchema.parse(req.body)), "Expense updated");

export const removeExpense = async (req: Request, res: Response) => {
    await deleteTripExpense(uid(req), req.params.id, req.params.expenseId);
    reply.ok(res, null, "Expense deleted");
};

export const settle = async (req: Request, res: Response) => {
    await settleUp(uid(req), req.params.id, settleSchema.parse(req.body));
    reply.ok(res, null, "Settled");
};

export const close = async (req: Request, res: Response) => {
    await closeTrip(uid(req), req.params.id, closeTripSchema.parse(req.body ?? {}).letGo);
    reply.ok(res, null, "Trip closed");
};

export const reopen = async (req: Request, res: Response) => {
    await reopenTrip(uid(req), req.params.id);
    reply.ok(res, null, "Trip reopened");
};

export const importPreview = async (req: Request, res: Response) => {
    const { csv, mapping } = importPreviewSchema.parse(req.body);
    reply.ok(res, await previewImport(uid(req), req.params.id, csv, mapping), "Preview ready");
};

export const importCommit = async (req: Request, res: Response) => {
    const { csv, mapping, decisions } = importCommitSchema.parse(req.body);
    reply.ok(res, await commitImport(uid(req), req.params.id, csv, mapping, decisions), "Imported");
};
