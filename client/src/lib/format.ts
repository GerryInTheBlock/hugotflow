/** Display helpers shared by the console and the member app (Philippine formats). */

export function peso(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  const s = Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}₱${s}`;
}

// Dates are built by hand: browsers format "en-PH" differently ("Nov 01, 2026" vs "01 Nov 2026"),
// and Figma always uses day-month-year.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Plain dates (YYYY-MM-DD) are calendar days; read them as local so they don't shift a day. */
function toDate(iso: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
}

/** "14 Nov" */
export function dayMonth(iso: string): string {
  const d = toDate(iso);
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]}`;
}

/** "9:02 AM" */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  return `${h}:${pad(d.getMinutes())} ${d.getHours() < 12 ? "AM" : "PM"}`;
}

/** "14 Nov 2026" */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${dayMonth(iso)} ${toDate(iso).getFullYear()}`;
}

/** "14 Nov 2026, 3:05 PM" */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${shortDate(iso)}, ${clockTime(iso)}`;
}

/** Today in Philippine time as YYYY-MM-DD (the gym's calendar day). */
export function manilaToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

/** Whole days from today (Manila) until an ISO date; negative if past. */
export function daysUntil(isoDate: string): number {
  const a = new Date(`${manilaToday()}T00:00:00Z`).getTime();
  const b = new Date(`${isoDate}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "01–30 Oct 2026", "16 Nov – 15 Dec 2026", "20 Dec 2026 – 18 Jan 2027" (Figma "Covers …"). */
export function dateRange(start: string, end: string): string {
  const [y1, m1] = start.split("-");
  const [y2, m2] = end.split("-");
  if (y1 === y2 && m1 === m2) return `${start.slice(8, 10)}–${dayMonth(end)} ${y2}`;
  if (y1 === y2) return `${dayMonth(start)} – ${dayMonth(end)} ${y2}`;
  return `${shortDate(start)} – ${shortDate(end)}`;
}

/** "9:02 AM" for today, "02 Nov" for earlier days. */
export function timeOrDate(iso: string): string {
  const today = new Date().toDateString() === new Date(iso).toDateString();
  return today ? clockTime(iso) : dayMonth(iso);
}
