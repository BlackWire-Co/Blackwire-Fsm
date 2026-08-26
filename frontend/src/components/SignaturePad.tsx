import { useRef, useState } from "react";

export default function SignaturePad({ onSave }: { onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#15151b";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStroke(true);
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  }

  function save() {
    onSave(canvasRef.current!.toDataURL("image/png"));
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="signature-pad"
        width={500}
        height={160}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" className="btn ghost" onClick={clear}>Clear</button>
        <button type="button" className="btn primary" disabled={!hasStroke} onClick={save}>Save Signature</button>
      </div>
    </div>
  );
}
