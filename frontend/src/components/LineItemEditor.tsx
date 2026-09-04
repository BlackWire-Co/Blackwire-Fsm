export interface LineItemDraft {
  description: string;
  quantity: string;
  unitPrice: string;
  taxable: boolean;
}

export function emptyLineItem(): LineItemDraft {
  return { description: "", quantity: "1", unitPrice: "0", taxable: true };
}

export default function LineItemEditor({
  items,
  onChange,
  priceBook,
}: {
  items: LineItemDraft[];
  onChange: (items: LineItemDraft[]) => void;
  priceBook?: any[];
}) {
  function update(i: number, patch: Partial<LineItemDraft>) {
    onChange(items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function addFromPriceBook(itemId: string) {
    const pbItem = priceBook?.find((p) => p.id === itemId);
    if (!pbItem) return;
    const blank = items.length === 1 && !items[0].description;
    const newItem: LineItemDraft = { description: pbItem.name, quantity: "1", unitPrice: String(pbItem.salePrice), taxable: pbItem.taxable };
    onChange(blank ? [newItem] : [...items, newItem]);
  }

  const subtotal = items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unitPrice || 0), 0);

  return (
    <div>
      {priceBook && priceBook.length > 0 && (
        <select
          defaultValue=""
          style={{ marginBottom: 10 }}
          onChange={(e) => { if (e.target.value) addFromPriceBook(e.target.value); e.target.value = ""; }}
        >
          <option value="">+ Add from price book…</option>
          {priceBook.map((p) => <option key={p.id} value={p.id}>{p.name} - ${Number(p.salePrice).toFixed(2)}</option>)}
        </select>
      )}
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <input
            placeholder="Description"
            value={item.description}
            onChange={(e) => update(i, { description: e.target.value })}
            style={{ flex: 2 }}
          />
          <input
            type="number" min="0" step="0.5" placeholder="Qty"
            value={item.quantity}
            onChange={(e) => update(i, { quantity: e.target.value })}
            style={{ width: 70 }}
          />
          <input
            type="number" min="0" step="0.01" placeholder="Unit price"
            value={item.unitPrice}
            onChange={(e) => update(i, { unitPrice: e.target.value })}
            style={{ width: 100 }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--muted)", width: 60 }}>
            <input type="checkbox" checked={item.taxable} onChange={(e) => update(i, { taxable: e.target.checked })} style={{ width: "auto" }} />
            Tax
          </label>
          <div style={{ width: 80, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13 }}>
            ${(Number(item.quantity || 0) * Number(item.unitPrice || 0)).toFixed(2)}
          </div>
          <button type="button" className="btn ghost" onClick={() => remove(i)} disabled={items.length === 1}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <button type="button" className="btn ghost" onClick={() => onChange([...items, emptyLineItem()])}>+ Add line item</button>
        <div className="who">Subtotal: <strong style={{ color: "var(--ink)" }}>${subtotal.toFixed(2)}</strong></div>
      </div>
    </div>
  );
}
