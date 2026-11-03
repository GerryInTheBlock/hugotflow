/**
 * Printable reports (objective 1e; Fig 9). The report is written as a plain white page into a hidden frame and
 * printed from there, so every row prints (not only what fits on screen) and the console nav never does.
 * "Download PDF" is the same page: the browser's print dialog has "Save as PDF".
 */
export type PrintableReport = {
  gym: string;
  title: string;
  generated: string;
  totals: [string, string][];
  header: string[];
  rows: string[][];
  note?: string;
  /** Reporting period shown under the title, e.g. "October 2026" or "as of 03 Nov 2026". */
  period?: string;
  /** Who generated it, for the "Prepared by" signature line, e.g. "Merly Belo, Owner". */
  preparedBy?: string;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Formal printed report (adviser review, Nov 2026): letterhead with the gym's name and address, report title and
 * period, totals, the full table, a "Prepared by / Noted by" signature block, and "Page x of y" on every page.
 */
export function reportHtml(r: PrintableReport) {
  const [gymName, ...addr] = r.gym.split("·").map((s) => s.trim());
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.title)}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 18mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 9px; color: #555; } @bottom-left { content: "HugotFlow · ${esc(gymName)}"; font-size: 9px; color: #555; } }
  * { box-sizing: border-box; }
  body { font-family: Poppins, "Segoe UI", Arial, sans-serif; color: #111; margin: 0; font-size: 11px; }
  .head { text-align: center; border-bottom: 2px solid #E3061B; padding-bottom: 8px; margin-bottom: 12px; }
  .head .name { font-size: 18px; font-weight: 800; letter-spacing: .06em; }
  .head .addr { font-size: 10px; color: #444; }
  .head .sys { font-size: 9px; color: #777; margin-top: 2px; }
  h1 { font-size: 15px; margin: 6px 0 2px; text-align: center; text-transform: uppercase; letter-spacing: .04em; }
  .period { text-align: center; font-size: 11px; margin-bottom: 4px; }
  .gen { font-size: 9px; color: #555; margin-bottom: 12px; text-align: center; }
  .sign { display: flex; gap: 40px; margin-top: 36px; page-break-inside: avoid; }
  .sign div { flex: 1; font-size: 10px; }
  .sign .line { border-top: 1px solid #111; margin-top: 34px; padding-top: 3px; font-weight: 600; }
  .sign .role { color: #555; font-weight: 400; }
  .totals { display: flex; gap: 10px; margin-bottom: 14px; }
  .total { flex: 1; border: 1px solid #ccc; border-radius: 8px; padding: 8px 10px; }
  .total span { display: block; font-size: 9px; color: #555; }
  .total b { font-size: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; background: #eee; padding: 6px; border-bottom: 1px solid #bbb; }
  td { padding: 5px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  .note { margin-top: 10px; font-size: 9px; color: #555; }
</style></head><body>
<div class="head"><div class="name">${esc(gymName.toUpperCase())}</div>${addr.length ? `<div class="addr">${esc(addr.join(", "))}</div>` : ""}<div class="sys">HugotFlow Gym Management System</div></div>
<h1>${esc(r.title.split(" — ")[0])}</h1>
${r.period ? `<div class="period">${esc(r.period)}</div>` : ""}
<div class="gen">${esc(r.generated)}</div>
<div class="totals">${r.totals.map(([k, v]) => `<div class="total"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>
<table><thead><tr>${r.header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${r.rows.length ? r.rows.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${r.header.length}">No records for this period.</td></tr>`}</tbody></table>
${r.note ? `<div class="note">${esc(r.note)}</div>` : ""}
<div class="sign"><div>Prepared by:<div class="line">${esc(r.preparedBy?.split(",")[0] ?? "")}&nbsp;<div class="role">${esc(r.preparedBy?.split(",").slice(1).join(",").trim() || "Signature over printed name")}</div></div></div><div>Noted by:<div class="line">&nbsp;<div class="role">Gym Owner / Manager</div></div></div></div>
</body></html>`;
}

/** Opens the browser print dialog for the report (web only). Resolves once the dialog has been shown. */
export function printReport(r: PrintableReport) {
  if (typeof document === "undefined") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(reportHtml(r));
    doc.close();
    const go = () => {
      frame.contentWindow!.focus();
      frame.contentWindow!.print();
      setTimeout(() => {
        frame.remove();
        resolve();
      }, 1000);
    };
    // Give the frame a moment to lay out before printing.
    setTimeout(go, 250);
  });
}
