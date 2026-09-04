import PDFDocument from "pdfkit";
import { computeTotals } from "./money";

interface DocLineItem {
  description: string;
  quantity: number | string | { toString(): string };
  unitPrice: number | string | { toString(): string };
  taxable: boolean;
}

interface DocData {
  kind: "ESTIMATE" | "INVOICE";
  number: string;
  date: Date;
  dueOrExpiration?: Date | null;
  status: string;
  customer: { firstName: string; lastName: string; companyName?: string | null; email?: string | null; phone?: string | null };
  property: { addressLine1: string; addressLine2?: string | null; city: string; state: string; zip: string };
  items: DocLineItem[];
  taxRate: number | string | { toString(): string };
  discount: number | string | { toString(): string };
  notes?: string | null;
  terms?: string | null;
  payments?: { amount: number | string | { toString(): string }; paidAt: Date; method: string }[];
  signature?: { imageData: string; signerName: string; signedAt: Date; type: string } | null;
  company: { name: string; address?: string | null; phone?: string | null; email?: string | null };
}

const ACCENT = "#5548d9";
const INK = "#15151b";
const MUTED = "#6b7178";
const PAGE_BOTTOM = 742; // LETTER height (792) minus 50pt bottom margin

const colX = { desc: 50, qty: 330, price: 400, total: 480 };

export function generateDocumentPdf(data: DocData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // A single tracked cursor is the only source of truth for vertical
    // position throughout the whole document. Every block below measures
    // its own real rendered height (via heightOfString for wrapped text)
    // before advancing the cursor, and checks for a page break before
    // drawing anything - this is what the old version got wrong: it mixed
    // pdfkit's own internal flow cursor with a separately-tracked variable
    // that didn't account for wrapped multi-line text, so later blocks
    // (totals, signature, notes) could start before earlier content had
    // actually finished rendering.
    let y = 50;

    function ensureSpace(neededHeight: number) {
      if (y + neededHeight > PAGE_BOTTOM) {
        doc.addPage();
        y = 50;
        return true;
      }
      return false;
    }

    function drawTableHeader() {
      doc.fontSize(9).fillColor(MUTED).font("Helvetica-Bold");
      doc.text("DESCRIPTION", colX.desc, y, { width: 270 });
      doc.text("QTY", colX.qty, y, { width: 50, align: "right" });
      doc.text("PRICE", colX.price, y, { width: 60, align: "right" });
      doc.text("TOTAL", colX.total, y, { width: 70, align: "right" });
      y += 14;
      doc.moveTo(50, y).lineTo(550, y).strokeColor("#dcdad4").stroke();
      y += 10;
    }

    // --- Header ---
    doc.fillColor(INK).fontSize(18).font("Helvetica-Bold").text(data.company.name, 50, y);
    y = doc.y + 2;
    doc.fontSize(9).font("Helvetica").fillColor(MUTED);
    if (data.company.address) {
      doc.text(data.company.address, 50, y);
      y = doc.y;
    }
    if (data.company.phone || data.company.email) {
      doc.text([data.company.phone, data.company.email].filter(Boolean).join("  ·  "), 50, y);
      y = doc.y;
    }

    const headerTopY = 50;
    doc.fontSize(20).font("Helvetica-Bold").fillColor(ACCENT).text(data.kind === "ESTIMATE" ? "ESTIMATE" : "INVOICE", 350, headerTopY, { width: 200, align: "right" });
    doc.fontSize(10).font("Helvetica").fillColor(INK).text(data.number, 350, doc.y, { width: 200, align: "right" });
    doc.fillColor(MUTED).text(`Status: ${data.status}`, 350, doc.y, { width: 200, align: "right" });

    y = Math.max(y, doc.y) + 24;

    // --- Bill-to / dates ---
    const billToTop = y;
    doc.fontSize(9).fillColor(MUTED).font("Helvetica").text("BILL TO", 50, billToTop);
    doc.fontSize(11).fillColor(INK).font("Helvetica-Bold").text(
      data.customer.companyName || `${data.customer.firstName} ${data.customer.lastName}`,
      50, doc.y
    );
    doc.font("Helvetica").fontSize(10).fillColor(MUTED);
    if (data.customer.companyName) doc.text(`${data.customer.firstName} ${data.customer.lastName}`, 50, doc.y);
    doc.text(`${data.property.addressLine1}${data.property.addressLine2 ? ", " + data.property.addressLine2 : ""}`, 50, doc.y);
    doc.text(`${data.property.city}, ${data.property.state} ${data.property.zip}`, 50, doc.y);
    if (data.customer.phone) doc.text(data.customer.phone, 50, doc.y);
    if (data.customer.email) doc.text(data.customer.email, 50, doc.y);
    const billToBottom = doc.y;

    doc.fontSize(9).fillColor(MUTED).text("DATE", 350, billToTop, { width: 200, align: "right" });
    doc.fontSize(11).fillColor(INK).text(data.date.toLocaleDateString(), 350, doc.y, { width: 200, align: "right" });
    if (data.dueOrExpiration) {
      doc.fontSize(9).fillColor(MUTED).text(data.kind === "ESTIMATE" ? "EXPIRES" : "DUE", 350, doc.y + 6, { width: 200, align: "right" });
      doc.fontSize(11).fillColor(INK).text(data.dueOrExpiration.toLocaleDateString(), 350, doc.y, { width: 200, align: "right" });
    }
    const datesBottom = doc.y;

    y = Math.max(billToBottom, datesBottom) + 24;

    // --- Line items table ---
    drawTableHeader();
    doc.font("Helvetica").fillColor(INK).fontSize(10);

    for (const item of data.items) {
      const lineTotal = Number(item.quantity) * Number(item.unitPrice);
      const descHeight = doc.heightOfString(item.description, { width: 270 });
      const rowHeight = Math.max(20, descHeight + 6);

      if (ensureSpace(rowHeight)) {
        drawTableHeader();
        doc.font("Helvetica").fillColor(INK).fontSize(10);
      }

      doc.text(item.description, colX.desc, y, { width: 270 });
      doc.text(String(item.quantity), colX.qty, y, { width: 50, align: "right" });
      doc.text(`$${Number(item.unitPrice).toFixed(2)}`, colX.price, y, { width: 60, align: "right" });
      doc.text(`$${lineTotal.toFixed(2)}`, colX.total, y, { width: 70, align: "right" });
      y += rowHeight;
    }

    ensureSpace(20);
    doc.moveTo(50, y + 4).lineTo(550, y + 4).strokeColor("#dcdad4").stroke();
    y += 18;

    // --- Totals ---
    const totals = computeTotals(data.items, data.taxRate, data.discount);
    const paid = data.payments?.length ? data.payments.reduce((s, p) => s + Number(p.amount), 0) : 0;
    const totalsRowCount = 1 + (totals.tax > 0 ? 1 : 0) + (totals.discount > 0 ? 1 : 0) + 1 + (data.payments?.length ? 2 : 0);
    ensureSpace(totalsRowCount * 18 + 10);

    const totalsRow = (label: string, value: string, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 12 : 10).fillColor(bold ? INK : MUTED);
      doc.text(label, 350, y, { width: 120, align: "right" });
      doc.fillColor(INK).text(value, 470, y, { width: 80, align: "right" });
      y += bold ? 20 : 16;
    };
    totalsRow("Subtotal", `$${totals.subtotal.toFixed(2)}`);
    if (totals.tax > 0) totalsRow("Tax", `$${totals.tax.toFixed(2)}`);
    if (totals.discount > 0) totalsRow("Discount", `-$${totals.discount.toFixed(2)}`);
    totalsRow("Total", `$${totals.total.toFixed(2)}`, true);
    if (data.payments?.length) {
      totalsRow("Paid", `$${paid.toFixed(2)}`);
      totalsRow("Balance Due", `$${(totals.total - paid).toFixed(2)}`, true);
    }

    // --- Signature ---
    if (data.signature) {
      y += 16;
      try {
        const base64 = data.signature.imageData.replace(/^data:image\/\w+;base64,/, "");
        const imgBuffer = Buffer.from(base64, "base64");
        const img = (doc as any).openImage(imgBuffer);
        const imgWidth = 180;
        const imgHeight = (imgWidth / img.width) * img.height;
        const blockHeight = 14 + 6 + imgHeight + 8 + 12;

        ensureSpace(blockHeight);
        doc.fontSize(9).fillColor(MUTED).font("Helvetica-Bold").text("SIGNED", 50, y);
        y = doc.y + 6;
        doc.image(imgBuffer, 50, y, { width: imgWidth });
        y += imgHeight + 8;
        doc.fontSize(9).fillColor(MUTED).font("Helvetica").text(
          `${data.signature.signerName} · ${data.signature.signedAt.toLocaleString()}`,
          50, y
        );
        y = doc.y;
      } catch {
        // If the stored signature image is ever malformed, skip it rather
        // than fail the whole PDF.
      }
    }

    // --- Notes / Terms ---
    if (data.notes) {
      y += 16;
      const notesHeight = doc.heightOfString(data.notes, { width: 500 });
      ensureSpace(20 + notesHeight);
      doc.fontSize(9).fillColor(MUTED).font("Helvetica-Bold").text("NOTES", 50, y);
      y = doc.y + 2;
      doc.font("Helvetica").fillColor(INK).fontSize(10).text(data.notes, 50, y, { width: 500 });
      y = doc.y;
    }
    if (data.terms) {
      y += 12;
      const termsHeight = doc.heightOfString(data.terms, { width: 500 });
      ensureSpace(20 + termsHeight);
      doc.fontSize(9).fillColor(MUTED).font("Helvetica-Bold").text("TERMS", 50, y);
      y = doc.y + 2;
      doc.font("Helvetica").fillColor(INK).fontSize(10).text(data.terms, 50, y, { width: 500 });
    }

    doc.end();
  });
}
