# Label Printing Operations

## What Is Live

DukaPilot can produce product labels from **Barcode management > Labels** or the
**Print label** action in Inventory. Browser print and PDF are the universal
first choice. Labels default to 40 x 30 mm and can be configured with a
different width, height, gap, columns, and content layout.

Each print action creates an audit record with the selected product snapshots, template, profile, output driver, and completion status. Product prices are captured at preparation time so a later price change does not alter the record of an earlier label job.

## Printer-Independent Design

The label system has four layers:

`Product data -> Label template -> Renderer -> Output driver -> Local printer transport`

Output drivers do not assume a manufacturer:

- Browser and PDF use a dedicated document with `@page` sizing.
- ZPL supports Zebra-compatible printers.
- TSPL supports TSC and compatible Xprinter printers.
- ESC/POS supports compatible receipt printers.

The web application intentionally does not attempt to discover or control printers from Railway. A direct-printer workflow needs a trusted local transport, such as an approved DukaPilot print bridge, a managed desktop QZ Tray deployment, or a future native Android printing module.

## What Works Today

- **Browser print:** opens the device or browser print dialog. On Android, the
  merchant pairs the printer first, then chooses it in Android's print dialog.
- **PDF:** downloads fixed-size label pages for printing, sharing, or a desktop
  print workflow.
- **Raw command download:** ZPL, TSPL, and ESC/POS profiles produce a file on
  the merchant's device. The operator or a separately installed local bridge
  sends that file to the printer.

A selected `QZ Tray` or `DukaPilot print bridge` profile records the intended
transport. It does **not** establish a connection by itself in this release.
Do not promise one-tap Bluetooth, USB, network, Zebra, Xprinter, or TSC printing
until the local transport and a physical model have passed the approval process.

## Direct Printing Roadmap

1. **Android first:** build a native companion/bridge in the DukaPilot Android
   wrapper. It must request Android Bluetooth/USB permissions explicitly, use a
   merchant-approved paired printer only, queue/retry locally, and record a
   device-safe result without putting printer credentials in the cloud.
2. **Desktop option:** integrate QZ Tray only with a signing certificate and
   server-side signing endpoint. Never put a QZ private signing key in the web
   bundle or a printer profile.
3. **Hardware certification:** test one or two 203 DPI models with actual
   40 x 30 mm media, document their driver/language/DPI/profile, and support
   those named models before advertising compatibility more broadly.

## Support Process

1. Ask for printer model, DPI, label width and height, and connection type.
2. Create a profile using the matching output driver.
3. Print or download a one-label sample first.
4. Confirm barcode scanability and that the price/name fit without clipping.
5. Record the approved model and profile settings before recommending it to another merchant.

Do not promise direct Bluetooth, USB, or network printing in the browser unless the merchant has the approved local transport installed and tested.

## Release Checklist

1. Railway applies `20260923001000_label_printing_and_product_codes` before
   Vercel exposes the matching UI.
2. Create a generated internal barcode and SKU, then confirm duplicate manual
   values are rejected within the same shop location.
3. Print one valid EAN-13/UPC label with browser print and download a PDF.
4. Scan the finished label with the actual scanner or phone before approving it.
5. Test one raw command file only with the exact approved printer/bridge;
   preserve the profile name, driver, DPI, and label dimensions for support.
