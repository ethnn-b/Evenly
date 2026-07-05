"use client";

import { useState } from "react";
import { runOcr } from "@/lib/ocr";
import { guessMerchantName } from "@/lib/expenseName";
import { formatCents, dollarsToCents } from "@/lib/format";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import type { ReceiptItem } from "@/lib/types";

// File input + preview that runs OCR in the browser and hands the parsed total
// and items up to the parent (ExpenseForm). Nothing is uploaded to a server in
// v1: the image stays on the device and Tesseract.js reads it locally.
//
// OCR often misreads a digit, so the detected total is shown in an editable
// field. Correcting it here re-sends the total to the parent, which keeps the
// expense amount in sync.
//
// After OCR, the merchant name from the top of the receipt is suggested as the
// expense name and handed up via onNamed. No model, no network round-trip.
export default function ReceiptUpload({
  onParsed,
  onNamed,
}: {
  onParsed: (result: { total: number | null; items: ReceiptItem[] }) => void;
  onNamed?: (name: string) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">(
    "idle"
  );
  const [progress, setProgress] = useState(0);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [totalInput, setTotalInput] = useState(""); // detected total, editable
  const [error, setError] = useState<string | null>(null);
  const [suggestedName, setSuggestedName] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setItems([]);
    setTotalInput("");
    setSuggestedName("");
    setProgress(0);
    setStatus("running");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const result = await runOcr(file, (f) => setProgress(f));
      setItems(result.items);
      setTotalInput(result.total !== null ? (result.total / 100).toFixed(2) : "");
      setStatus("done");
      onParsed({ total: result.total, items: result.items });

      // Suggest a name: the merchant name from the top of the receipt text.
      // Deterministic and instant, so no loading state is needed.
      if (onNamed) {
        const name = guessMerchantName(result.rawText);
        setSuggestedName(name);
        onNamed(name);
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "OCR failed.");
    }
  }

  // User corrected the detected total: push the fixed value up so the expense
  // amount follows it. A blank/invalid entry sends null (parent leaves the
  // amount alone).
  function onTotalEdit(value: string) {
    setTotalInput(value);
    onParsed({ total: dollarsToCents(value), items });
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
        <div className="mt-3 space-y-2">
          <p className="text-sm text-green-700">
            Read {items.length} item{items.length === 1 ? "" : "s"}. Check the
            total below before adding.
          </p>
          <div>
            <label
              htmlFor="ocr-total"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Detected total (edit if the scan misread it)
            </label>
            <div className="flex items-center gap-1">
              <span className="text-gray-500">{DEFAULT_CURRENCY.symbol}</span>
              <input
                id="ocr-total"
                type="text"
                inputMode="decimal"
                value={totalInput}
                onChange={(e) => onTotalEdit(e.target.value)}
                placeholder="0.00"
                className="w-32 rounded border border-gray-300 px-2 py-1 text-right focus:border-gray-500 focus:outline-none"
              />
            </div>
          </div>

          {suggestedName && (
            <p className="text-xs text-gray-600">
              Suggested name:{" "}
              <span className="font-medium text-gray-900">{suggestedName}</span>{" "}
              (edit it in the form below)
            </p>
          )}
        </div>
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
