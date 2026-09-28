const { readConfig } = require("../src/config");
const { createBridgeServer } = require("../src/server");

async function run() {
  const config = readConfig({
    BRIDGE_HOST: "127.0.0.1", BRIDGE_PORT: "9123", PRINTER_LAN_IP: "192.168.1.50",
    PRINTER_PROTOCOL: "TSPL", PRINTER_CONNECTION: "NETWORK",
  });
  const server = createBridgeServer(config, { send: async () => {} });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const base = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${base}/health`).then((response) => response.json());
    const printers = await fetch(`${base}/printers`).then((response) => response.json());
    if (!health.ok || !printers.printers?.length) throw new Error("Bridge smoke test failed");
    console.log("Bridge smoke test passed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
run().catch((error) => { console.error(error.message); process.exitCode = 1; });
