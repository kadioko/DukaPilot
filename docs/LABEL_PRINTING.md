# Label Printing Operations

## What Is Live

DukaPilot can produce product labels from Barcode management or Inventory. Browser print and PDF are the universal first choice. Labels have a fixed default size of 40 x 30 mm and can be configured with a different width, height, gap, and content layout.

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

## Support Process

1. Ask for printer model, DPI, label width and height, and connection type.
2. Create a profile using the matching output driver.
3. Print or download a one-label sample first.
4. Confirm barcode scanability and that the price/name fit without clipping.
5. Record the approved model and profile settings before recommending it to another merchant.

Do not promise direct Bluetooth, USB, or network printing in the browser unless the merchant has the approved local transport installed and tested.
