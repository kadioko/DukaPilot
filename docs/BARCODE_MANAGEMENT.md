# Barcode And Label Management

DukaPilot supports manufacturer EAN-13 and UPC codes, Code 128 codes, and generated internal DukaPilot codes such as `DP00000001`. Codes are normalized to uppercase and are unique within a shop location, so two branches may stock the same manufacturer item without sharing inventory.

## Product Setup

1. In **Inventory**, enter or scan a manufacturer barcode and optionally choose **Also generate a DukaPilot barcode**. Both codes can be retained on one product.
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

Open **Barcode management > Labels** or choose **Print label** from a product in Inventory. Users need an active plan and **Stock** permission. The default is a 40 x 30 mm label. Merchants can choose:

- product name and price
- barcode only
- product name and barcode
- product name, price, and barcode
- custom fields: name, selling/wholesale price, preferred/manufacturer/DukaPilot barcode, SKU, unit, stock, and custom text

The label composer supports multiple products, up to 100 copies per product, browser printing, and PDF download. It opens a dedicated print document with its own page size; it does not rely on the main app's print CSS.

## Printer Profiles

Saved profiles keep a name, model, size, DPI, template reference, connection type, and output driver. They do not store bridge tokens, printer passwords, or LAN addresses. A selected local bridge can send to one configured network printer only after the merchant installs it locally; see [DukaPilot Print Bridge](../dukapilot-print-bridge/README.md).

| Driver | Use |
| --- | --- |
| Browser | Opens the system/browser print dialog. This is the default and works with installed Android, desktop, and network printers. |
| PDF | Downloads fixed-size product-label pages. |
| ZPL | Downloads commands for Zebra-compatible printers. |
| TSPL | Downloads commands for TSC and compatible Xprinter label printers. |
| EPL | Downloads commands for legacy EPL-compatible printers. |
| ESC/POS | Downloads raw receipt-printer-compatible commands. |

ZPL, TSPL, EPL, and ESC/POS files can be downloaded or sent to a trusted local DukaPilot Print Bridge. DukaPilot does not send raw printer commands from Railway to merchant hardware. USB and Bluetooth remain future native-adapter paths; pair or connect physical hardware on the merchant device. See [Label Printing Operations](./LABEL_PRINTING.md) before offering direct printing to a merchant.

## Rollout Checklist

Deploy migration `20260928001000_print_bridge_and_label_profiles` after all earlier migrations before deploying the backend. Then test:

1. One valid EAN-13 code and one valid UPC code.
2. A generated DukaPilot barcode and SKU.
3. A 40 x 30 mm browser print and PDF download.
4. One ZPL, TSPL, EPL, or ESC/POS command file with the intended physical printer or approved local bridge.
5. Camera and Bluetooth/USB keyboard-wedge scanning on a merchant phone.
