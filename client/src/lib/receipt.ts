/**
 * Receipt lines shared by the console's printed receipt and the member's Digital receipt
 * (Figma "Digital receipt (new)"; Figure 5: "staff issues the receipts").
 */
import { Platform, Share } from "react-native";
import { dateTime, dayMonth, peso, shortDate } from "./format";
import { methodLabel, refundReason, statusLabel, type Receipt } from "./payments";

const roleName: Record<string, string> = { admin: "Owner", staff: "Staff", instructor: "Instructor", member: "Member" };
const person = (name: string | null, role: string | null) => (name ? `${name}${role ? ` (${roleName[role] ?? role})` : ""}` : "—");

function planLine(r: Receipt) {
  if (r.kind === "day_pass") return `Day pass (${r.pass_hours ?? 12} hours)`;
  if (r.kind === "refund") return `Refund · ${refundReason(r.notes) ?? r.plan_name ?? ""}`;
  return `${r.plan_name ?? "Plan"}${r.plan_days ? ` (${r.plan_days} days)` : ""}`;
}

export function receiptRows(r: Receipt): [string, string][] {
  const rows: [string, string][] = [
    ["Member", r.payer ?? "—"],
    ["Plan", planLine(r)],
  ];
  if (r.rate !== null && r.kind === "subscription") rows.push(["Rate", peso(r.rate)]);
  if (r.discount !== "none") {
    rows.push(["Discount", r.discount === "student" && r.rate !== null ? `Student −${peso(r.rate - Number(r.amount))}` : r.discount === "senior" ? "Senior rate" : "Student"]);
  }
  if (r.coverage_start && r.coverage_end) {
    const sameYear = r.coverage_start.slice(0, 4) === r.coverage_end.slice(0, 4);
    const start = sameYear ? dayMonth(r.coverage_start) : shortDate(r.coverage_start);
    rows.push(["Coverage", `${start} – ${shortDate(r.coverage_end)}`]);
  }
  rows.push(["Method", r.gcash_reference ? `GCash · Ref ${r.gcash_reference}` : methodLabel[r.payment_type]]);
  rows.push(["Recorded by", person(r.recorded_by, r.recorded_by_role)]);
  if (r.confirmed_by) rows.push(["Confirmed by", person(r.confirmed_by, r.confirmed_by_role)]);
  return rows;
}

export function receiptSubtitle(r: Receipt) {
  return `No. ${r.receipt_no ?? "—"} · ${dateTime(r.created_at)}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * "Save receipt": on the web it opens a print dialog with only the receipt (print or save as PDF);
 * on a phone it opens the share sheet with the receipt as text.
 */
export async function saveReceipt(r: Receipt): Promise<boolean> {
  const rows = receiptRows(r);
  if (Platform.OS !== "web") {
    const text = [`Hugot Gym · Official receipt`, receiptSubtitle(r), `Amount: ${peso(r.amount)} (${statusLabel[r.status]})`, ...rows.map(([k, v]) => `${k}: ${v}`)].join("\n");
    await Share.share({ message: text, title: r.receipt_no ?? "Receipt" });
    return true;
  }
  if (typeof window === "undefined") return false;
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) return false;
  const body = rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.receipt_no ?? "Receipt")}</title>
<style>
  body{font-family:Poppins,Arial,Helvetica,sans-serif;margin:24px;color:#111}
  h1{font-size:20px;margin:0}
  .sub{color:#555;font-size:12px;margin:2px 0 12px}
  .amt{font-size:30px;font-weight:bold;margin:8px 0 4px}
  .status{font-size:12px;color:#555;margin-bottom:12px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{padding:6px 0;border-bottom:1px dashed #ccc;vertical-align:top}
  td:last-child{text-align:right;font-weight:bold}
  .note{color:#555;font-size:11px;margin-top:16px}
</style></head><body>
  <h1>Hugot Gym · Official receipt</h1>
  <div class="sub">${esc(receiptSubtitle(r))}</div>
  <div class="amt">${esc(peso(r.amount))}</div>
  <div class="status">${esc(statusLabel[r.status])}</div>
  <table>${body}</table>
  <div class="note">HugotFlow does not take payments in the app. This receipt records a cash or GCash payment confirmed at Hugot Gym.</div>
  <script>window.onload=function(){window.print();}</script>
</body></html>`);
  w.document.close();
  return true;
}
