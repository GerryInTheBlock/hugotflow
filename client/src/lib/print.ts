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
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function reportHtml(r: PrintableReport) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Poppins, "Segoe UI", Arial, sans-serif; color: #111; margin: 0; font-size: 11px; }
  .gym { font-size: 10px; color: #555; letter-spacing: .02em; }
  h1 { font-size: 18px; margin: 6px 0 2px; }
  .gen { font-size: 10px; color: #555; margin-bottom: 12px; }
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
<div class="gym">${esc(r.gym)}</div>
<h1>${esc(r.title)}</h1>
<div class="gen">${esc(r.generated)}</div>
<div class="totals">${r.totals.map(([k, v]) => `<div class="total"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>
<table><thead><tr>${r.header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${r.rows.length ? r.rows.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${r.header.length}">No records for this period.</td></tr>`}</tbody></table>
${r.note ? `<div class="note">${esc(r.note)}</div>` : ""}
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
