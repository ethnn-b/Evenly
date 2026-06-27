"use client";

import { useState } from "react";
import { runOcr } from "@/lib/ocr";
import { formatCents } from "@/lib/format";
import type { ReceiptItem } from "@/lib/types";

// File input + preview that runs OCR in the browser and hands the parsed total
// and items up to the parent (ExpenseForm). Nothing is uploaded to a server in
// v1: the image stays on the device and Tesseract.js reads it locally.
export default function ReceiptUpload({
  onParsed,
}: {
  onParsed: (result: { total: number | null; items: ReceiptItem[] }) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">(
    "idle"
  );
  const [progress, setProgress] = useState(0);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setItems([]);
    setProgress(0);
    setStatus("running");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const result = await runOcr(file, (f) => setProgress(f));
      setItems(result.items);
      setStatus("done");
      onParsed({ total: result.total, items: result.items });
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "OCR failed.");
    }
  }

  return (
    <div className="rounded border border-gray-200 bg-white p-4">
      <label className="mb-2 block text-sm font-medium">
        Scan a receipt (optional)
      </label>
      <input
        type="file"
        accept="image/*"
        onChange={onFile}
        className="block w-full text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-white hover:file:bg-gray-700"
      />

      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Receipt preview"
          className="mt-3 max-h-48 rounded border border-gray-200"
        />
      )}

      {status === "running" && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
            <div
              className="h-full bg-gray-900 transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Reading receipt... {Math.round(progress * 100)}%
          </p>
        </div>
      )}

      {status === "done" && (
        <p className="mt-3 text-sm text-green-700">
          Found {items.length} item{items.length === 1 ? "" : "s"}. The amount
          has been prefilled.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {items.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-gray-600">
          {items.map((it, i) => (
            <li key={i} className="flex justify-between">
              <span>{it.name}</span>
              <span className="tabular-nums">{formatCents(it.price)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
