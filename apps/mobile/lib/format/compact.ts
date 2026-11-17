import { amountsMasked, maskedMoney } from "@/lib/money";
import { signFor, type MoneyOptions } from "@/lib/format/money";

// Compact rupees for chart axis ticks and nothing else: every figure someone reads is exact.
// Rounds first, then picks the unit, so ₹99,960 is "₹1L", not "₹100k".

const tenth = (n: number): number => Math.round(n * 10 + 1e-9) / 10;
const trim = (n: number): string => n.toFixed(1).replace(/\.0$/, "");

/** Never masked: for files. 9996000 -> "₹1L", -820000 -> "−₹8.2k", 4250 -> "₹43". */
export const formatCompactExact = (paise: number, { sign = "auto" }: MoneyOptions = {}): string => {
  const rupees = Math.abs(paise) / 100;
  let body: string;
  let shown: number;

  if (Math.round(rupees) < 1_000) {
    shown = Math.round(rupees);
    body = String(shown);
  }
  else if (tenth(rupees / 1e3) < 100) {
    shown = tenth(rupees / 1e3);
    body = `${trim(shown)}k`;
  }
  else if (tenth(rupees / 1e5) < 100) {
    shown = tenth(rupees / 1e5);
    body = `${trim(shown)}L`;
  }
  else {
    shown = tenth(rupees / 1e7);
    body = `${trim(shown)}Cr`;
  }

  return `${signFor(shown === 0 ? 0 : paise, sign)}₹${body}`;
};

/** The screen form: masked like every other amount. */
export const formatCompact = (paise: number, opts: MoneyOptions = {}): string =>
  amountsMasked() ? maskedMoney(shownSign(paise), opts.sign) : formatCompactExact(paise, opts);

// A figure that rounds to "₹0" carries no sign while masked either.
const shownSign = (paise: number): number => (Math.round(Math.abs(paise) / 100) === 0 ? 0 : paise);
