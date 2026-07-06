"use client";

import { useRef, useState } from "react";
import { runOcr } from "@/lib/ocr";
import { suggestExpense, heuristicSuggestion } from "@/lib/suggestExpense";
import type { ExpenseCategory } from "@/lib/categories";
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
// After OCR, a name is suggested in two stages: first the instant local
// heuristic (merchant name from the top of the receipt), then an upgrade from an
// open-weight model (via /api/suggest-expense) that also proposes a category.
// The suggested name is handed up via onNamed; if the model is unavailable the
// heuristic stands on its own.
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
  const [suggestedCategory, setSuggestedCategory] =
    useState<ExpenseCategory | null>(null);
  const [naming, setNaming] = useState(false);
  // The model's total, offered when it disagrees with the parser's; and a flag
  // for when the model's total filled a field the parser left empty.
  const [aiTotalOffer, setAiTotalOffer] = useState<number | null>(null);
  const [totalEstimated, setTotalEstimated] = useState(false);
  // Cancels an in-flight suggestion request when a newer scan starts.
  const suggestAbort = useRef<AbortController | null>(null);
  // Mirrors totalInput so the async suggestion callback reads the latest value
  // (not a stale closure) when deciding whether to adopt the model's total.
  const totalInputRef = useRef("");

  // Set the editable total field and keep the ref in sync.
  function writeTotalField(value: string) {
    setTotalInput(value);
    totalInputRef.current = value;
  }

  // Adopt a total (from the model) into the field and push it to the parent.
  function applyTotal(cents: number, forItems: ReceiptItem[]) {
    writeTotalField((cents / 100).toFixed(2));
    onParsed({ total: cents, items: forItems });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    suggestAbort.current?.abort();
    setError(null);
    setItems([]);
    writeTotalField("");
    setSuggestedName("");
    setSuggestedCategory(null);
    setAiTotalOffer(null);
    setTotalEstimated(false);
    setProgress(0);
    setStatus("running");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const result = await runOcr(file, (f) => setProgress(f));
      setItems(result.items);
      writeTotalField(
        result.total !== null ? (result.total / 100).toFixed(2) : ""
      );
      setStatus("done");
      onParsed({ total: result.total, items: result.items });

      // Stage 1: instant local heuristic so the form fills with no wait.
      const baseline = heuristicSuggestion(result.rawText);
      setSuggestedName(baseline.name);
      onNamed?.(baseline.name);

      // Stage 2: ask the model for a better title and a category. If it answers
      // before a newer scan supersedes this one, upgrade the suggestion in
      // place. onNamed is safe to call again: the form only takes it while the
      // user has not edited the description. suggestExpense never rejects (it
      // falls back to the heuristic), so a plain .then covers every case.
      const controller = new AbortController();
      suggestAbort.current = controller;
      setNaming(true);
      suggestExpense(result.rawText, { signal: controller.signal })
        .then((s) => {
          if (controller.signal.aborted) return;
          setSuggestedName(s.name);
          setSuggestedCategory(s.category);
          if (s.source === "llm") onNamed?.(s.name);

          // Total: if the parser found none, adopt the model's; if both exist
          // but disagree, offer the model's without overwriting.
          if (s.totalCents != null) {
            const current = dollarsToCents(totalInputRef.current);
            if (current == null) {
              applyTotal(s.totalCents, result.items);
              setTotalEstimated(true);
            } else if (current !== s.totalCents) {
              setAiTotalOffer(s.totalCents);
            }
          }
        })
        .finally(() => {
          if (suggestAbort.current === controller) {
            suggestAbort.current = null;
            setNaming(false);
          }
        });
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "OCR failed.");
    }
  }

  // User corrected the detected total: push the fixed value up so the expense
  // amount follows it. A blank/invalid entry sends null (parent leaves the
  // amount alone).
  function onTotalEdit(value: string) {
    writeTotalField(value);
    setTotalEstimated(false); // user's own number now
    setAiTotalOffer(null);
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
            {totalEstimated && (
              <p className="mt-1 text-xs text-gray-500">
                No clear total line was found, so this is the model&apos;s read.
                Double-check it.
              </p>
            )}
            {aiTotalOffer != null && (
              <button
                type="button"
                onClick={() => {
                  applyTotal(aiTotalOffer, items);
                  setAiTotalOffer(null);
                }}
                className="mt-1 block text-xs text-gray-600 underline hover:text-gray-900"
              >
                Model read {formatCents(aiTotalOffer)} instead. Use it?
              </button>
            )}
          </div>

          {suggestedName && (
            <p className="text-xs text-gray-600">
              Suggested name:{" "}
              <span className="font-medium text-gray-900">{suggestedName}</span>
              {suggestedCategory && (
                <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">
                  {suggestedCategory}
                </span>
              )}
              {naming ? (
                <span className="ml-2 text-gray-400">refining...</span>
              ) : (
                " (edit it in the form below)"
              )}
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
