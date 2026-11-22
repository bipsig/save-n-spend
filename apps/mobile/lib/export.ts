import type { ITransaction, Paginated } from "@save-n-spend/types";
// SDK 54 ships a new file API by default; the classic string helpers we need
// (writeAsStringAsync / cacheDirectory / copyAsync) live under /legacy.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import { get } from "@/lib/api";
import { rangeBounds, rangeLabel, type RangeKey } from "@/lib/dateRange";
import { categoryLabel } from "@/lib/categories";
import { accountById } from "@/lib/accounts";
// The exact formatter, never the privacy-masked default — "₹ ••••" in a file the user
// asked for would be a bug.
import { formatMoneyExact as formatMoney } from "@/lib/money";
import { appZone, dayKey, zonedParts } from "@/lib/zone";
import { htmlEscape, kpiCard, kpiRow, pdfDocument } from "@/lib/pdfShell";
import { count } from "@/lib/format/count";
import { formatSpan } from "@/lib/format/period";

export { htmlEscape };

export type ExportFormat = "csv" | "pdf";

export type ExportResult = { shared: boolean; count: number };

// Every transaction in the range, not a page: the list endpoint caps limit at 100, so walk
// until the server says there are no more.
const fetchAllInRange = async (bounds: { startDate?: string; endDate?: string }): Promise<ITransaction[]> => {
  const all: ITransaction[] = [];
  let page = 1;

  for (;;) {
    // As on the Activity screen: everyday rows and one row per closed trip on its close day.
    const params = [`page=${page}`, "limit=100", "trips=entries"];
    if (bounds.startDate) params.push(`startDate=${bounds.startDate}`);
    if (bounds.endDate) params.push(`endDate=${bounds.endDate}`);
    const res = await get<Paginated<ITransaction>>(`/transactions?${params.join("&")}`, { cache: false });

    all.push(...res.items);
    if (!res.hasNextPage || res.items.length === 0) break;
    page += 1;
    if (page > 500) break; // hard safety stop (~50k rows)
  }
  return all;
};

const pad = (n: number) => String(n).padStart(2, "0");

// Both stamps read the user's zone, not the device's: a statement covering their September
// should not be stamped 31 August because the phone was in another country.
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

const accName = (id: string | undefined) => (id ? accountById(id)?.name ?? "" : "");

// Two fields, not one: a spreadsheet is where someone pivots spend by heading, and a lone
// "Groceries" cell makes that impossible. A top-level category's name lands in `Category`
// with `Sub-category` blank, so a pivot on `Category` is correct for both levels at once.
const catColumns = (id: string | null): [category: string, sub: string] => {
  if (!id) return ["", ""];
  const label = categoryLabel(id);
  return label.isChild ? [label.parentName ?? "", label.name] : [label.name, ""];
};

/** The one-line form, for the PDF where there is no second column to give it. */
const catPath = (id: string | null) => (id ? categoryLabel(id).path : "");

// A closed trip's one row (trips=entries): an Expense in Trips on its close day, no time and no
// account, its whole share.
const isTripRow = (tx: ITransaction) => tx.kind === "trip";
const tripDay = (tx: ITransaction) => tx.closedOn ?? dayStamp(new Date(tx.occurredAt));
const tripNote = (tx: ITransaction) => {
  const zone = appZone();
  const span = tx.startDate && tx.endDate ? formatSpan(dayKey(new Date(tx.startDate), zone), dayKey(new Date(tx.endDate), zone), { year: "always" }) : null;
  return `${span ? `Trip ${span} · ` : ""}your share`;
};

// CSV.

const CSV_HEADERS = [
  "Date", "Time", "Type", "Title", "Category", "Sub-category", "Account",
  "To Account", "Amount (INR)", "Payment Mode", "Note", "Location",
];

export const csvEscape = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const buildCsv = (txns: ITransaction[]): string => {
  const lines = txns.map((tx) => {
    if (isTripRow(tx)) {
      return [tripDay(tx), "", TYPE_LABEL.expense, tx.title ?? "", "Trips", "", "", "", (-tx.amount / 100).toFixed(2), "", tripNote(tx), ""]
        .map((v) => csvEscape(String(v))).join(",");
    }
    const d = new Date(tx.occurredAt);
    return [
      dayStamp(d),
      clockStamp(d),
      TYPE_LABEL[tx.type] ?? tx.type,
      tx.title ?? "",
      ...catColumns(tx.category),
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

// PDF (via printable HTML).

const buildHtml = (txns: ITransaction[], range: RangeKey, offset: number): string => {
  let income = 0;
  let expense = 0;
  let trips = 0;
  for (const tx of txns) {
    if (tx.type === "income" || tx.type === "positiveAdjustment") income += tx.amount;
    else if (tx.type === "expense" || tx.type === "negativeAdjustment") expense += tx.amount;
    if (isTripRow(tx)) trips += tx.amount;
  }
  const net = income - expense;

  const rows = txns
    .map((tx) => {
      if (isTripRow(tx)) {
        return `<tr class="trip">
        <td class="date">${htmlEscape(tripDay(tx))}</td>
        <td><div class="desc">${htmlEscape(tx.title ?? "Trip")}</div><div class="sub">${htmlEscape(`Trips · ${tripNote(tx)}`)}</div></td>
        <td class="amt neg">${htmlEscape(formatMoney(-tx.amount))}</td>
      </tr>`;
      }
      const d = new Date(tx.occurredAt);
      const desc = tx.title || catPath(tx.category) || TYPE_LABEL[tx.type] || "—";
      const sub = tx.type === "transfer"
        ? `${accName(tx.account)} → ${accName(tx.toAccount)}`
        : [catPath(tx.category), accName(tx.account)].filter(Boolean).join(" · ");
      // A transfer prints plain, as on screen (D7): nothing was earned or spent. The CSV keeps
      // it signed, so a column of amounts still sums to the net.
      const isTransfer = tx.type === "transfer";
      const amount = formatMoney(isTransfer ? tx.amount : signedPaise(tx));
      const positive = !isTransfer && signedPaise(tx) >= 0;
      return `<tr>
        <td class="date">${dayStamp(d)}<span class="time">${clockStamp(d)}</span></td>
        <td><div class="desc">${htmlEscape(desc)}</div><div class="sub">${htmlEscape(sub)}</div></td>
        <td class="amt ${positive ? "pos" : "neg"}">${htmlEscape(amount)}</td>
      </tr>`;
    })
    .join("");

  return pdfDocument({
    section: "Transactions",
    rangeLabel: rangeLabel(range, offset),
    meta: count(txns.length, "transaction"),
    body: `${kpiRow([
      kpiCard("Income", htmlEscape(formatMoney(income)), "pos"),
      kpiCard("Expenses", htmlEscape(formatMoney(expense)), "neg", trips > 0 ? `incl. Trips ${formatMoney(trips)}` : ""),
      kpiCard("Net", htmlEscape(formatMoney(net)), net >= 0 ? "pos" : "neg", "= saved"),
    ])}
    <table>
      <thead><tr><th>Date</th><th>Transaction</th><th class="amt">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`,
    css: `
    table { margin-top: 20px; }
    td { vertical-align: top; padding: 9px 8px; }
    td.date { color: #6b6880; white-space: nowrap; }
    td.date .time { display: block; font-size: 10px; opacity: 0.7; }
    .desc { font-weight: 600; }
    .sub { color: #6b6880; font-size: 11px; margin-top: 2px; }
    td.amt { font-weight: 700; white-space: nowrap; }
    td.amt.pos { color: #0f9d63; } td.amt.neg { color: #1a1730; }
    tr.trip td { background: #e9fbf8; }`,
  });
};

// Delivery (shared).

// Write the built content to a friendly-named file and hand it to the OS share sheet.
// `content` is the CSV text for "csv", or the printable HTML for "pdf".
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
    // Print names the file with a random uuid, so copy it to a friendly name first.
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

// Entry point.

// Build the file for the chosen range/format and hand it to the OS share sheet. Returns
// { shared: false } on an empty range, so the caller can say so instead of sharing it.
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
