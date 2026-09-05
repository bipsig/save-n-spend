import { deviceZone, zoneOffsetMinutes } from "@/lib/zone";

// The zone list behind the Settings picker.
//
// There are ~450 IANA zones and almost nobody wants to scroll them. So the picker
// works in two modes and this file feeds both:
//
//   • before the user types — the device's own zone plus a curated shortlist of the
//     ones an actual person is likely to pick. Short enough to read.
//   • once they type — the FULL set the runtime knows about, so someone in
//     Tegucigalpa isn't stuck with a shortlist that forgot them.
//
// The full set is asked of the engine rather than hard-coded, because a hard-coded
// list of zone names goes stale every time a country redraws one, and the engine's
// list is the same one that has to resolve the name anyway.

// Hermes may not implement Intl Enumeration, and the type only exists in lib.es2022.
// Read defensively: absent just means the shortlist is all we can offer.
const enumerated = (): string[] => {
  const supportedValuesOf = (Intl as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
  if (typeof supportedValuesOf !== "function") return [];
  try {
    return supportedValuesOf("timeZone");
  }
  catch {
    return [];
  }
};

// One per real offset the world uses, weighted towards where this app's users are.
// India first — it is the default and the overwhelmingly likely answer.
const SHORTLIST = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kathmandu",
  "Asia/Dhaka",
  "Asia/Colombo",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Jakarta",
  "Asia/Manila",
  "Asia/Riyadh",
  "Asia/Tehran",
  "Asia/Jerusalem",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Zurich",
  "Europe/Stockholm",
  "Europe/Moscow",
  "Europe/Istanbul",
  "Africa/Cairo",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "America/New_York",
  "America/Toronto",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Phoenix",
  "America/Mexico_City",
  "America/Bogota",
  "America/Sao_Paulo",
  "America/Buenos_Aires",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Australia/Perth",
  "Australia/Brisbane",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Adelaide",
  "Pacific/Auckland",
  "Pacific/Fiji",
  "UTC",
];

export type ZoneOption = {
  zone: string;
  /** "Kolkata" — the city half of the name, readable. */
  city: string;
  /** "Asia" — the region half, shown as the row's second line and searchable. */
  region: string;
  /** "GMT+5:30" as of right now. */
  offset: string;
};

// "GMT+5:30" / "GMT−4" / "GMT" — minutes only when a zone actually has them, and a
// real minus sign, because a hyphen at this size reads as a dash between two labels.
const offsetText = (zone: string, at: Date): string => {
  // A name the engine can't resolve throws inside Intl. The server validates the
  // zone it stores, so this is only reachable for a name an older engine has never
  // heard of — in which case the row still names the place, just without an offset.
  let minutes: number;
  try {
    minutes = zoneOffsetMinutes(at, zone);
  }
  catch {
    return "";
  }
  if (minutes === 0) return "GMT";
  const sign = minutes > 0 ? "+" : "−";
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  return `GMT${sign}${hours}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
};

const describe = (zone: string, at: Date): ZoneOption => {
  const parts = zone.split("/");
  // "America/Argentina/Buenos_Aires" → city "Buenos Aires", region "America/Argentina".
  const city = (parts[parts.length - 1] ?? zone).replace(/_/g, " ");
  const region = parts.length > 1 ? parts.slice(0, -1).join(" / ").replace(/_/g, " ") : "Coordinated Universal Time";
  return { zone, city, region, offset: offsetText(zone, at) };
};

// Built once per app run. Offsets are read at build time, which is exact for every
// purpose this list serves — the label is a hint for picking a zone, not the arithmetic
// (that always re-reads the offset at the instant in question; see lib/zone).
let cache: { shortlist: ZoneOption[]; all: ZoneOption[] } | null = null;

const build = () => {
  if (cache) return cache;
  const at = new Date();
  const device = deviceZone();

  // The device's zone is always offered, even when it isn't one of the curated
  // names — it's the single likeliest pick and it must never be missing.
  const shortNames = SHORTLIST.includes(device) ? SHORTLIST : [device, ...SHORTLIST];

  const everything = enumerated();
  const allNames = everything.length > 0
    ? Array.from(new Set([...shortNames, ...everything]))
    : shortNames;

  cache = {
    shortlist: shortNames.map((zone) => describe(zone, at)),
    all: allNames.map((zone) => describe(zone, at)),
  };
  return cache;
};

/** What the picker lists before the user types. */
export const shortlistZones = (): ZoneOption[] => build().shortlist;

/**
 * Zones matching a typed term, capped so the sheet can't be handed 400 rows to lay
 * out. Matches the city, the region, the raw name, and the offset — "530", "gmt+5",
 * and "kolkata" all find India.
 */
export const searchZones = (term: string, limit = 40): ZoneOption[] => {
  const needle = term.trim().toLowerCase();
  if (needle === "") return shortlistZones();

  // A typed "+5:30" or "5.30" should still match "GMT+5:30".
  const compact = needle.replace(/[\s:.]/g, "");

  return build().all
    .filter((option) => {
      const haystack = `${option.city} ${option.region} ${option.zone}`.toLowerCase();
      if (haystack.includes(needle)) return true;
      return option.offset.toLowerCase().replace(/[\s:.]/g, "").includes(compact);
    })
    .slice(0, limit);
};

/** The label a settings row shows for the saved zone. */
export const zoneLabel = (zone: string): string => {
  const { city, offset } = describe(zone, new Date());
  return offset ? `${city} · ${offset}` : city;
};
