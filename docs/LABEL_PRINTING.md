# Product Labels and Printing

## What DukaPilot Supports

Open **Barcode management > Labels** or the **Print label** action in Inventory.
Merchants can search products, select one or many products, set the number of
copies, choose a saved template, and print through a browser, PDF, downloaded
raw printer file, or the local DukaPilot Print Bridge.

Templates can contain:

- Product name and selling price
- Wholesale price
- SKU and unit
- Manufacturer barcode and DukaPilot internal barcode
- Preferred barcode (DukaPilot code first, then manufacturer code)
- Stock quantity and custom text

Built-in layouts are barcode-only, name and price, name and barcode, name,
price and barcode, plus custom fields. The default is **40 x 30 mm**. The
screen also provides 48 x 30 mm, 62 x 30 mm, and 80 x 40 mm presets.

Every prepared job saves a product/template/profile snapshot for audit history.
Bridge tokens are never stored in DukaPilot or sent to Railway.

Each physical product label carries **one** 1D barcode field: preferred,
manufacturer, or DukaPilot internal. This keeps the code large enough to scan
on 40 x 30 mm media and prevents two linear codes from overlapping. Use
separate label jobs when both codes must be printed.

Browser and PDF output is rendered from the immutable job snapshot created by
the API, so the printed product fields match the recorded job even if someone
edits a product immediately afterwards. A staff member with Stock permission
can print ordinary labels, but wholesale-price fields and raw output from a
wholesale job remain owner/report-permission only.
Prepared snapshots for restricted staff omit wholesale prices, and completion
responses contain status metadata only, never historical product snapshots.

## Output Options

| Output | Use it for | Status |
| --- | --- | --- |
| Browser print | Any device with an installed system printer | Ready |
| PDF | Sharing or universal desktop/phone printing | Ready |
| ZPL | Zebra and compatible command-language printers | Ready to download or bridge |
| TSPL | TSC, Xprinter-compatible label printers | Ready to download or bridge |
| EPL | Older EPL-compatible printers | Ready to download or bridge |
| ESC/POS | Compatible receipt printers | Ready to download or bridge |

The web app does not control a USB, Bluetooth, or LAN printer directly from
Vercel. It sends commands only to a merchant-run local bridge on
`127.0.0.1`. This keeps the printer network and access token out of the cloud.
Raw drivers can also be downloaded without saving a profile, which is useful
for testing a new printer before making it the shop default.

## Product Codes

The product record keeps the older canonical `barcode` for compatibility and
now also supports:

- `manufacturerBarcode`: the scanned EAN/UPC/Code 128 supplied with a product
- `internalBarcode`: an optional generated DukaPilot code

Both are checked for duplicates within the same shop. The POS barcode lookup
recognizes the canonical, manufacturer, and internal values, so either
approved label can add the product to a sale.

## Xprinter XP-D281B / XP-D281E

The first recommended setup is **TSPL**, **203 DPI** (or 300 DPI only for a
verified 300-DPI model), 40 x 30 mm media, and LAN/raw TCP port **9100**.
Create a profile with:

- Output: `TSPL`
- Connection: `LAN via local bridge`
- Model: `XP-D281B` or `XP-D281E`
- DPI: matching the printer's actual specification

This creates valid TSPL output but is not a claim that every XP-D281B/D281E
firmware or interface has been physically certified. Print one test label,
scan it, and record the working DPI/media/profile before rolling it out.

## Local Print Bridge

The bridge is a separate Node.js 20+ service in
[`dukapilot-print-bridge`](../dukapilot-print-bridge). It is intentionally
loopback-only and sends validated raw output to a configured network printer.

See the bridge [setup and troubleshooting guide](../dukapilot-print-bridge/README.md)
for LAN configuration, IP discovery, test printing, and recovery steps.

Use `http://127.0.0.1:9123` or `http://localhost:9123`, changing the port when
needed. The frontend security policy permits these loopback hosts; it does not
permit arbitrary HTTP/LAN hosts. Test bridge and direct printing use the URL
currently entered in the form, including edits not yet saved as a profile.
Browser local-network permission and bridge CORS rules still apply. These
allowances do not make the bridge available from another phone/computer.

## Regression Checks

- Backend controller tests cover restricted wholesale access in prepared jobs,
  historical downloads, and completion responses.
- Browser tests cover editing the bridge port under the real site CSP, template
  deletion with HTTP 204, and a two-page PDF with 40 x 30 mm media dimensions.
- CI runs bridge unit tests and a loopback/TCP smoke test without real hardware.
- None of these automated checks certify a physical printer, label calibration,
  barcode scan quality, or every browser's local-network permission behavior.

## Merchant Workflow

1. Add a manufacturer barcode in Inventory when the product already has one.
2. Optionally tick **Also generate a DukaPilot barcode**.
3. Open **Barcode management > Labels**.
4. Search/select products and set copies.
5. Choose what the label shows and its size.
6. Use Browser/PDF, download raw commands, or select a local-bridge profile.
7. Test one label first. Confirm its size, content, and scanability before
   printing a larger batch.

The `columns` value retained in older templates is not used by the current
single-label renderer. DukaPilot prints one label per media page/command; do
not use old multi-column templates until sheet-label support is explicitly
released.

## Support Boundaries

- USB and Bluetooth are profile options reserved for a future native adapter;
  they do not silently claim direct support.
- A local bridge can print to a LAN printer, but must never bind to a public
  network interface.
- DukaPilot does not store printer passwords, bridge tokens, or LAN addresses
  in its database.
- Do not recommend a printer as certified until its exact protocol, DPI,
  media, and physical sample have passed the support test.
