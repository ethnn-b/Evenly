# Sample receipts

Six real receipt photos for manually testing the receipt upload flow (OCR total
prefill, editing a misread total, expense auto-naming, and splits). Drop one into
the file input on the add-expense page.

The `.jpg` files are not committed (see `.gitignore`): they come from the ICDAR
2019 SROIE dataset, which is for research and not ours to redistribute. This
guide is tracked; regenerate the images locally with the command at the bottom.

## What's here

The filename is `<merchant>_<expected-total>.jpg`. These were picked because the
OCR reads their total correctly, so they make a clean demo.

| File | Merchant | Expected total | Items | Good for |
| --- | --- | --- | --- | --- |
| `restoran-wan-sheng_9.60.jpg` | Restoran Wan Sheng | 9.60 | 4 | small bill, clean scan, drinks |
| `sanyu-stationery_36.00.jpg` | Sanyu Stationery Shop | 36.00 | 4 | round total |
| `gardenia-bakeries_41.87.jpg` | Gardenia Bakeries | 41.87 | 5 | bakery items |
| `99-speed-mart_61.65.jpg` | 99 Speed Mart | 61.65 | 10 | many line items |
| `bens-grocer_77.20.jpg` | Bens Independent Grocer | 77.20 | 6 | grocery run |
| `sin-thye_110.00.jpg` | Sin Thye & Company | 110.00 | 6 | larger total |

## What to check

- **Total prefill.** After the scan, the detected total should match the
  expected total above and fill the expense amount.
- **Correcting a misread.** Edit the "Detected total" field and watch the amount
  follow it. (Try a receipt not in this list to see a real misread to fix.)
- **Auto-naming.** The merchant name from the top of the receipt is suggested as
  the expense name. The suggestion prefills the description only if you left it
  blank, and you can edit it.
- **Splits.** Switch the split to Unequally and give members different shares;
  saving is blocked until the shares add up to the total.

Note on currency: these are Malaysian ringgit (RM) receipts. The app shows
amounts with the rupee symbol (₹) by default and does not convert, so a 9.60
total displays as ₹9.60. Only the number matters for testing the pipeline.

## Regenerating the images

The eval script caches the whole dataset under `.ocr-eval-cache/`. Populate it,
then copy these six ids:

```
npm run eval:ocr            # downloads/caches receipts into .ocr-eval-cache/
cp .ocr-eval-cache/img/140.jpg samples/restoran-wan-sheng_9.60.jpg
cp .ocr-eval-cache/img/480.jpg samples/sanyu-stationery_36.00.jpg
cp .ocr-eval-cache/img/360.jpg samples/gardenia-bakeries_41.87.jpg
cp .ocr-eval-cache/img/380.jpg samples/99-speed-mart_61.65.jpg
cp .ocr-eval-cache/img/060.jpg samples/bens-grocer_77.20.jpg
cp .ocr-eval-cache/img/400.jpg samples/sin-thye_110.00.jpg
```
