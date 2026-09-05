import type { ITransaction } from "@save-n-spend/types";
// SDK 54 ships a new file API by default; the classic string helpers we need
// (writeAsStringAsync / cacheDirectory / copyAsync) live under /legacy.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import { get } from "@/lib/api";
import { rangeBounds, rangeLabel, type RangeKey } from "@/lib/dateRange";
import { categoryById } from "@/lib/categories";
import { accountById } from "@/lib/accounts";
// The exact formatter, never the privacy-masked default: an exported file is
// one the user explicitly asked us to generate, so "₹ ••••" in it would be a bug.
import { formatMoneyExact as formatMoney } from "@/lib/money";
import { appZone, dayKey, zonedParts } from "@/lib/zone";

export type ExportFormat = "csv" | "pdf";

export type ExportResult = { shared: boolean; count: number };

interface Paginated<T> {
  docs: T[];
  page: number;
  hasNextPage: boolean;
}

// Export needs every transaction in the range, not a page. The list endpoint
// caps limit at 100, so walk the pages until the server says there are no more.
const fetchAllInRange = async (bounds: { startDate?: string; endDate?: string }): Promise<ITransaction[]> => {
  const all: ITransaction[] = [];
  let page = 1;

  for (;;) {
    const params = [`page=${page}`, "limit=100"];
    if (bounds.startDate) params.push(`startDate=${bounds.startDate}`);
    if (bounds.endDate) params.push(`endDate=${bounds.endDate}`);
    const res = await get<Paginated<ITransaction>>(`/transactions?${params.join("&")}`);

    all.push(...res.docs);
    if (!res.hasNextPage || res.docs.length === 0) break;
    page += 1;
    if (page > 500) break; // hard safety stop (~50k rows)
  }
  return all;
};

const pad = (n: number) => String(n).padStart(2, "0");

// Both stamps read the clock in the user's zone, not the device's. It matters for the
// filename an export is saved under and for the "generated at" line inside it: a
// statement covering the user's September should not be stamped 31 August because
// their phone happened to be in another country when they tapped Export.
export const dayStamp = (d: Date) => dayKey(d, appZone());

const clockStamp = (d: Date) => {
  const { hour, minute } = zonedParts(d, appZone());
  return `${pad(hour)}:${pad(minute)}`;
};

const TYPE_LABEL: Record<string, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
  positiveAdjustment: "Adjustment (+)",
  negativeAdjustment: "Adjustment (−)",
};

// Signed rupees: money in is positive, money out (expense / transfer / negative
// adjustment) is negative — so a column of amounts sums to the net.
const signedPaise = (tx: ITransaction): number =>
  tx.type === "income" || tx.type === "positiveAdjustment" ? tx.amount : -tx.amount;

const catName = (id: string | null) => (id ? categoryById(id)?.name ?? "" : "");
const accName = (id: string | undefined) => (id ? accountById(id)?.name ?? "" : "");

// ---- CSV --------------------------------------------------------------------

const CSV_HEADERS = [
  "Date", "Time", "Type", "Title", "Category", "Account",
  "To Account", "Amount (INR)", "Payment Mode", "Note", "Location",
];

export const csvEscape = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const buildCsv = (txns: ITransaction[]): string => {
  const lines = txns.map((tx) => {
    const d = new Date(tx.occurredAt);
    return [
      dayStamp(d),
      clockStamp(d),
      TYPE_LABEL[tx.type] ?? tx.type,
      tx.title ?? "",
      catName(tx.category),
      accName(tx.account),
      accName(tx.toAccount),
      (signedPaise(tx) / 100).toFixed(2),
      tx.paymentMode ?? "",
      tx.note ?? "",
      tx.location ?? "",
    ].map((v) => csvEscape(String(v))).join(",");
  });

  // BOM so Excel reads it as UTF-8 (₹, accented notes, etc.); CRLF line endings.
  return "﻿" + [CSV_HEADERS.join(","), ...lines].join("\r\n");
};

// ---- PDF (via printable HTML) -----------------------------------------------

export const htmlEscape = (value: string): string =>
  value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const buildHtml = (txns: ITransaction[], range: RangeKey, offset: number): string => {
  let income = 0;
  let expense = 0;
  for (const tx of txns) {
    if (tx.type === "income" || tx.type === "positiveAdjustment") income += tx.amount;
    else if (tx.type === "expense" || tx.type === "negativeAdjustment") expense += tx.amount;
  }
  const net = income - expense;

  const rows = txns
    .map((tx) => {
      const d = new Date(tx.occurredAt);
      const desc = tx.title || catName(tx.category) || TYPE_LABEL[tx.type] || "—";
      const sub = tx.type === "transfer"
        ? `${accName(tx.account)} → ${accName(tx.toAccount)}`
        : [catName(tx.category), accName(tx.account)].filter(Boolean).join(" · ");
      const amount = formatMoney(signedPaise(tx));
      const positive = signedPaise(tx) >= 0;
      return `<tr>
        <td class="date">${dayStamp(d)}<span class="time">${clockStamp(d)}</span></td>
        <td><div class="desc">${htmlEscape(desc)}</div><div class="sub">${htmlEscape(sub)}</div></td>
        <td class="amt ${positive ? "pos" : "neg"}">${htmlEscape(amount)}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1730; margin: 0; padding: 32px 28px; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #6D5CFF; padding-bottom: 14px; }
    .brand { font-size: 22px; font-weight: 800; letter-spacing: -0.4px; }
    .brand span { color: #6D5CFF; }
    .range { font-size: 12px; color: #6b6880; text-transform: uppercase; letter-spacing: 1px; text-align: right; }
    .cards { display: flex; gap: 12px; margin: 20px 0 24px; }
    .card { flex: 1; border: 1px solid #e7e5f0; border-radius: 12px; padding: 12px 14px; }
    .card .k { font-size: 10px; color: #6b6880; text-transform: uppercase; letter-spacing: 1px; }
    .card .v { font-size: 18px; font-weight: 800; margin-top: 4px; }
    .v.pos { color: #0f9d63; } .v.neg { color: #d64550; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; color: #6b6880; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; padding: 8px 8px; border-bottom: 1px solid #e7e5f0; }
    th.amt, td.amt { text-align: right; }
    td { padding: 9px 8px; border-bottom: 1px solid #f1f0f6; vertical-align: top; }
    td.date { color: #6b6880; white-space: nowrap; }
    td.date .time { display: block; font-size: 10px; opacity: 0.7; }
    .desc { font-weight: 600; }
    .sub { color: #6b6880; font-size: 11px; margin-top: 2px; }
    td.amt { font-weight: 700; white-space: nowrap; }
    td.amt.pos { color: #0f9d63; } td.amt.neg { color: #1a1730; }
    .foot { margin-top: 18px; font-size: 10px; color: #9995ad; text-align: center; }
  </style></head><body>
    <div class="head">
      <div class="brand">Save n <span>Spend</span></div>
      <div class="range">${htmlEscape(rangeLabel(range, offset))}<br/>${txns.length} transactions</div>
    </div>
    <div class="cards">
      <div class="card"><div class="k">Income</div><div class="v pos">${htmlEscape(formatMoney(income))}</div></div>
      <div class="card"><div class="k">Expenses</div><div class="v neg">${htmlEscape(formatMoney(expense))}</div></div>
      <div class="card"><div class="k">Net</div><div class="v ${net >= 0 ? "pos" : "neg"}">${htmlEscape(formatMoney(net))}</div></div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Transaction</th><th class="amt">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="foot">Generated by Save n Spend · ${dayStamp(new Date())}</div>
  </body></html>`;
};

// ---- delivery (shared) ------------------------------------------------------

// Write the built content to a friendly-named file and hand it to the OS share
// sheet. `content` is the CSV text for "csv", or the printable HTML for "pdf".
// Shared by every exporter (transactions, insights, …).
export const deliver = async (format: ExportFormat, baseName: string, content: string): Promise<void> => {
  let uri: string;
  let mimeType: string;
  let uti: string;

  if (format === "csv") {
    uri = `${FileSystem.cacheDirectory}${baseName}.csv`;
    await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
    mimeType = "text/csv";
    uti = "public.comma-separated-values-text";
  } else {
    const printed = await Print.printToFileAsync({ html: content });
    // Print names the file with a random uuid — copy it to a friendly name so the
    // share sheet shows "save-n-spend-…", then hand over the renamed copy.
    uri = `${FileSystem.cacheDirectory}${baseName}.pdf`;
    await FileSystem.copyAsync({ from: printed.uri, to: uri });
    mimeType = "application/pdf";
    uti = "com.adobe.pdf";
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing isn't available on this device.");
  }
  await Sharing.shareAsync(uri, { mimeType, UTI: uti, dialogTitle: "Export" });
};

// ---- entry point ------------------------------------------------------------

// Build the file for the chosen range/format and hand it to the OS share sheet.
// Returns { shared: false } when the range has no transactions so the caller can
// tell the user instead of sharing an empty file.
export const exportTransactions = async (
  format: ExportFormat,
  range: RangeKey,
  offset = 0,
): Promise<ExportResult> => {
  const txns = await fetchAllInRange(rangeBounds(range, offset));
  if (txns.length === 0) return { shared: false, count: 0 };

  const base = `save-n-spend-${range}-${dayStamp(new Date())}`;
  const content = format === "csv" ? buildCsv(txns) : buildHtml(txns, range, offset);
  await deliver(format, base, content);
  return { shared: true, count: txns.length };
};
