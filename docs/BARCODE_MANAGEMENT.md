# Barcode And Label Management

DukaPilot supports manufacturer EAN-13 and UPC codes, Code 128 codes, and generated internal DukaPilot codes such as `DP00000001`. Codes are normalized to uppercase and are unique within a shop location, so two branches may stock the same manufacturer item without sharing inventory.

## Product Setup

1. In **Inventory**, enter or scan a manufacturer barcode, or choose **Generate DukaPilot barcode**.
2. Enter a SKU or choose **Generate DukaPilot SKU** for a shop-specific internal product code.
3. Optionally add a short label name. It changes only the printed label, not the product name used in sales and reports.
4. EAN-13 and UPC values are checked for valid length and checksum before they are saved.

The generated barcode and SKU sequences are stored per shop. Existing generated values are preserved when the label-printing migration is deployed.

## Scanning

- The camera scanner uses ZXing with a manual-entry fallback.
- USB and Bluetooth scanners that behave like a keyboard are supported in POS: scan the code, then the scanner sends Enter.
- POS looks up the product, records the scan, and follows the shop setting for auto-add, sound, and vibration.
- Barcode settings can disable camera scans or keyboard-wedge Bluetooth/USB scans without disabling ordinary product search.
- Stock counts use the same barcode lookup and record a `STOCK_COUNT` scan event.

## Labels

Open **Barcode management > Labels** or choose **Print label** from a product in Inventory. The default is a 40 x 30 mm label. Merchants can choose:

- product name and price
- barcode only
- product name and barcode
- product name, price, and barcode
- custom fields: name, price, barcode, SKU, unit, and current stock

The label composer supports multiple products, up to 100 copies per product, browser printing, and PDF download. It opens a dedicated print document with its own page size; it does not rely on the main app's print CSS.

## Printer Profiles

Saved profiles keep a name, size, DPI, template reference, and output driver. They do not store printer passwords or network credentials.

| Driver | Use |
| --- | --- |
| Browser | Opens the system/browser print dialog. This is the default and works with installed Android, desktop, and network printers. |
| PDF | Downloads fixed-size product-label pages. |
| ZPL | Downloads commands for Zebra-compatible printers. |
| TSPL | Downloads commands for TSC and compatible Xprinter label printers. |
| ESC/POS | Downloads raw receipt-printer-compatible commands. |

ZPL, TSPL, and ESC/POS are generated locally for a trusted local print bridge or operator workflow. DukaPilot does not send raw printer commands from Railway to a merchant's hardware. Pairing or connecting a physical printer still happens on the merchant device.

## Rollout Checklist

Deploy migration `20260923001000_label_printing_and_product_codes` before deploying the backend. Then test:

1. One valid EAN-13 code and one valid UPC code.
2. A generated DukaPilot barcode and SKU.
3. A 40 x 30 mm browser print and PDF download.
4. One ZPL or TSPL command file with the intended physical printer or approved local bridge.
5. Camera and Bluetooth/USB keyboard-wedge scanning on a merchant phone.
