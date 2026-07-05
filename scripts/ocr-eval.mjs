// Accuracy eval for the receipt OCR parser, run against real receipt images.
//
// The unit tests in tests/ocr.test.ts check parseReceiptText() on hand-written
// text so they stay fast and offline. This script is the other half: it runs
// the *actual* pipeline (Tesseract.js OCR feeding the real parseReceiptText)
// against real photographed receipts and scores the extracted total against
// ground truth. It is slow and needs the network, so it is not part of
// `npm test`. Run it on demand:
//
//   npm run eval:ocr              # default sample
//   OCR_EVAL_N=60 npm run eval:ocr
//
// Dataset: ICDAR 2019 SROIE (scanned receipts), via the public mirror
// github.com/zzzDavid/ICDAR-2019-SROIE. Each receipt has a key/NNN.json with
// the ground-truth "total". Images and keys are cached under .ocr-eval-cache/
// (gitignored) so repeat runs do not re-download.
//
// Requires Node >= 22.6 (imports the TypeScript parser via native type
// stripping). The project already targets a modern Node for Next 15.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 6)) {
  console.error(
    `This eval needs Node >= 22.6 to import the TypeScript parser (you have ${process.versions.node}).`
  );
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const require = createRequire(path.join(repo, "package.json"));
const Tesseract = require("tesseract.js");
const { parseReceiptText } = await import(path.join(repo, "lib", "ocr.ts"));

const BASE =
  "https://raw.githubusercontent.com/zzzDavid/ICDAR-2019-SROIE/master/data";
const TOTAL_RECEIPTS = 626; // count in the mirror
const N = Math.max(1, Math.min(TOTAL_RECEIPTS, Number(process.env.OCR_EVAL_N) || 30));
const cache = path.join(repo, ".ocr-eval-cache");

// Evenly sample N receipt ids across the dataset (000, ..., 625).
const stride = Math.floor(TOTAL_RECEIPTS / N);
const ids = Array.from({ length: N }, (_, i) =>
  String(i * stride).padStart(3, "0")
);

const gtToCents = (s) => {
  const m = String(s).replace(/[, ]/g, "").match(/(\d+)\.(\d{2})/);
  return m ? parseInt(m[1], 10) * 100 + parseInt(m[2], 10) : null;
};
const fmt = (c) => (c == null ? "null" : "$" + (c / 100).toFixed(2));

async function download(id) {
  for (const [kind, ext] of [["img", "jpg"], ["key", "json"]]) {
    const dst = path.join(cache, kind, `${id}.${ext}`);
    if (fs.existsSync(dst)) continue;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const res = await fetch(`${BASE}/${kind}/${id}.${ext}`);
    if (!res.ok) throw new Error(`${kind}/${id}: HTTP ${res.status}`);
    fs.writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
  }
}

console.log(`Fetching ${N} receipts (cached in .ocr-eval-cache/) ...`);
const present = [];
for (let i = 0; i < ids.length; i += 8) {
  const batch = ids.slice(i, i + 8);
  const settled = await Promise.allSettled(batch.map(download));
  settled.forEach((r, j) => {
    if (r.status === "fulfilled") present.push(batch[j]);
    else console.warn(`  skip ${batch[j]}: ${r.reason.message}`);
  });
}

console.log(`Running OCR on ${present.length} receipts (~1s each) ...`);
// errorHandler is required: without it Tesseract re-throws a rejected job on
// the next tick, which crashes the whole process when one image is unreadable.
const worker = await Tesseract.createWorker("eng", 1, {
  cachePath: path.join(cache, ".tesseract"),
  errorHandler: () => {},
});

const rows = [];
let unreadable = 0;
for (const id of present) {
  const gt = JSON.parse(
    fs.readFileSync(path.join(cache, "key", `${id}.json`), "utf8")
  );
  const gtc = gtToCents(gt.total);
  let data;
  try {
    ({ data } = await worker.recognize(path.join(cache, "img", `${id}.jpg`)));
  } catch {
    unreadable += 1;
    process.stdout.write("!");
    continue; // Tesseract could not decode this image; leave it out of scoring
  }
  const parsed = parseReceiptText(data.text);
  const gtStr = gtc != null ? (gtc / 100).toFixed(2) : null;
  rows.push({
    id,
    gt: gtc,
    parsed: parsed.total,
    exact: gtc != null && parsed.total === gtc,
    err: gtc != null && parsed.total != null ? parsed.total - gtc : null,
    items: parsed.items.length,
    gt_in_text: gtStr != null && data.text.replace(/,/g, "").includes(gtStr),
  });
  process.stdout.write(".");
}
await worker.terminate();
console.log("\n");

const n = rows.length;
const pct = (k) => `${k}/${n} (${Math.round((100 * k) / n)}%)`;
const found = rows.filter((r) => r.parsed != null).length;
const exact = rows.filter((r) => r.exact).length;
const within10 = rows.filter((r) => r.err != null && Math.abs(r.err) <= 10).length;
const parserFault = rows.filter((r) => !r.exact && r.gt_in_text).length;
const ocrFault = rows.filter((r) => !r.exact && !r.gt_in_text).length;
const avgItems = (rows.reduce((s, r) => s + r.items, 0) / n).toFixed(1);

console.log("id   ground-truth  parsed     items  result");
for (const r of rows) {
  const note = r.exact
    ? "ok"
    : r.gt_in_text
    ? "X wrong line picked (parser)"
    : "X total misread (OCR)";
  console.log(
    `${r.id}  ${fmt(r.gt).padEnd(13)} ${fmt(r.parsed).padEnd(10)} ${String(
      r.items
    ).padEnd(6)} ${note}`
  );
}

console.log(`\n=== OCR total-extraction accuracy (n=${n} real receipts) ===`);
console.log("extracted a total (non-null):", pct(found));
console.log("total EXACTLY correct:       ", pct(exact));
console.log("total within $0.10:          ", pct(within10));
console.log("avg items parsed/receipt:    ", avgItems);
console.log("misses: parser picked wrong line:", parserFault, "| OCR misread digits:", ocrFault);
if (unreadable) console.log("images Tesseract could not decode (excluded):", unreadable);

fs.writeFileSync(
  path.join(cache, "results.json"),
  JSON.stringify(rows, null, 2)
);
console.log("\nper-receipt results written to .ocr-eval-cache/results.json");
