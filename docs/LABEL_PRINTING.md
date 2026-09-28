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

## Merchant Workflow

1. Add a manufacturer barcode in Inventory when the product already has one.
2. Optionally tick **Also generate a DukaPilot barcode**.
3. Open **Barcode management > Labels**.
4. Search/select products and set copies.
5. Choose what the label shows and its size.
6. Use Browser/PDF, download raw commands, or select a local-bridge profile.
7. Test one label first. Confirm its size, content, and scanability before
   printing a larger batch.

## Support Boundaries

- USB and Bluetooth are profile options reserved for a future native adapter;
  they do not silently claim direct support.
- A local bridge can print to a LAN printer, but must never bind to a public
  network interface.
- DukaPilot does not store printer passwords, bridge tokens, or LAN addresses
  in its database.
- Do not recommend a printer as certified until its exact protocol, DPI,
  media, and physical sample have passed the support test.
