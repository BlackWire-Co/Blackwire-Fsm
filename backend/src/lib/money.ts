// Accepts number, string, or Prisma's Decimal type (which has toString/valueOf
// and coerces correctly through Number()) — kept loose here since call sites
// pass raw Prisma query results straight through.
type Numeric = number | string | { toString(): string };

interface LineItem {
  quantity: Numeric;
  unitPrice: Numeric;
  taxable: boolean;
}

export function computeTotals(items: LineItem[], taxRate: Numeric, discount: Numeric) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
  const taxableSubtotal = items
    .filter((i) => i.taxable)
    .reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
  const tax = taxableSubtotal * (Number(taxRate) / 100);
  const total = subtotal + tax - Number(discount);

  return {
    subtotal: round2(subtotal),
    tax: round2(tax),
    discount: round2(Number(discount)),
    total: round2(total),
  };
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
