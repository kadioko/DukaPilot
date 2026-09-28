# DukaPilot Print Bridge

The DukaPilot Print Bridge is a small Node.js 20+ local service for sending
validated label commands to a configured **LAN/network** printer. It binds to
`127.0.0.1` by default, so a DukaPilot browser session can reach it on the same
computer while neither Railway nor Vercel can reach the printer.

It supports raw TCP printing (normally port `9100`) for:

- `TSPL` - TSC and many Xprinter-compatible label printers
- `ZPL` - Zebra and compatible printers
- `EPL` - legacy EPL-compatible printers
- `ESCPOS` - compatible receipt printers; data must be hexadecimal

The bridge does not run shell commands, accept arbitrary protocols, discover a
computer's USB devices, or expose a printer to the internet.

## Before You Start

You need:

1. Node.js 20 or later.
2. A computer on the same LAN as the printer.
3. The printer's LAN IP address and raw TCP port. `9100` is common but not
   universal.
4. The printer command language and DPI. Do not guess; check its manual,
   settings page, or vendor tool.

For Xprinter XP-D281B/D281E, start with TSPL, 203 DPI, 40 x 30 mm media, and
port 9100 only after confirming those settings on the individual device.

## Find the Printer IP

Use one of these safe methods:

- Print the printer's network self-test/configuration label.
- Check the printer's network/settings panel.
- Open the router's connected-device list and match the printer's MAC/model.
- Ask the network administrator.

Reserve the IP in the router when possible. The bridge does not scan the
network, which avoids sending traffic to unknown devices.

## Install and Configure

From this folder:

```powershell
Copy-Item .env.example .env
notepad .env
npm test
npm run smoke
npm start
```

Set at least these values in `.env`:

```dotenv
BRIDGE_HOST=127.0.0.1
BRIDGE_PORT=9123
BRIDGE_TOKEN=use-a-long-random-value
PRINTER_NAME=Xprinter XP-D281B
PRINTER_PROTOCOL=TSPL
PRINTER_CONNECTION=NETWORK
PRINTER_LAN_IP=192.168.1.120
PRINTER_TCP_PORT=9100
```

Keep `BRIDGE_HOST` as `127.0.0.1`, `localhost`, or `::1`. The service refuses
to bind to public or LAN interfaces. `BRIDGE_TOKEN` is optional but strongly
recommended. Enter it in the DukaPilot Labels screen only for the active
browser tab; it is never persisted in a printer profile.

## Test the Bridge

With the service running:

```powershell
Invoke-RestMethod http://127.0.0.1:9123/health
```

Expected result:

```json
{ "ok": true, "service": "dukapilot-print-bridge", "version": "1.0.0" }
```

Then in DukaPilot:

1. Open **Barcode management > Labels**.
2. Create/select a profile using `TSPL`, `ZPL`, `EPL`, or `ESC/POS`.
3. Choose **Local bridge** or **LAN via local bridge**.
4. Set `http://127.0.0.1:9123`.
5. Enter the bridge token for this tab if one was configured.
6. Select **Test bridge**, then **Test print**.

The test print contains only `DukaPilot test`, not shop/product data. Test a
single real label and scan it before printing a batch.

## Print Labels

1. Select one or more products and their number of copies.
2. Choose fields and a label size.
3. Select the saved profile.
4. Choose one:
   - **Download file**: saves `.tspl`, `.zpl`, `.epl`, or `.bin` for another
     approved local process.
   - **Print directly**: sends the generated validated command to this local
     bridge, which opens one raw TCP connection to the configured printer.

The bridge has `GET /health`, `GET /printers`, `POST /test`, and `POST /print`.
`POST /print` accepts only the configured printer ID and protocol:

```json
{
  "printerId": "default",
  "protocol": "TSPL",
  "data": "SIZE 40 mm,30 mm\r\n..."
}
```

For `ESCPOS`, `data` must be hexadecimal bytes.

## Load Labels Correctly

1. Put the media roll in the printer with the printable side facing the print
   head as specified by the printer manual.
2. Align guides tightly enough to prevent side drift.
3. Calibrate/gap-detect the printer after changing media.
4. Match DukaPilot's width and height to the real label stock.
5. Print exactly one label. Check content and barcode scanability.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Bridge unavailable | The bridge is running, URL is `http://127.0.0.1:9123`, and no firewall/extension blocks loopback access. |
| Authentication error | Re-enter the same `BRIDGE_TOKEN` from the bridge `.env`; it is not stored by DukaPilot. |
| Connection timeout | Verify printer power, LAN cable/Wi-Fi, IP, port, and that raw TCP is enabled. |
| Blank label | Use the actual printer language. TSPL sent to a ZPL-only device will not work. |
| Wrong size/offset | Match label dimensions, DPI, gap calibration, orientation, and printer driver settings. |
| Barcode does not scan | Print larger, use a supported barcode type, increase contrast, and test at least one physical sample. |
| Garbled text | Confirm the printer's encoding/font capabilities; raw printer language support differs by model. |

## USB and Bluetooth

USB and Bluetooth profiles exist in DukaPilot only as future extension points.
This bridge implements **LAN/network TCP** only. It will not claim a USB or
Bluetooth connection works until DukaPilot ships and tests a trusted native
desktop or Android adapter for that interface.

## Security Notes

- Do not change the bridge to listen on `0.0.0.0`.
- Do not put `.env` or bridge tokens in Git.
- Do not put printer credentials or IP addresses in DukaPilot profiles.
- Keep the bridge updated alongside DukaPilot and use the built-in tests before
  changing its protocol validation.
