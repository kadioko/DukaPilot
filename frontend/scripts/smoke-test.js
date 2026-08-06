const FRONTEND_URL = process.env.FRONTEND_SMOKE_URL || "https://www.dukapilot.com";

async function request(path = "/") {
  const response = await fetch(`${FRONTEND_URL}${path}`);
  const html = await response.text();
  return { response, html };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  console.log(`Running frontend smoke test against ${FRONTEND_URL}`);

  const home = await request("/");
  assert(home.response.ok, `Home page failed: ${home.response.status}`);
  assert(home.html.includes("DukaPilot"), "Home page does not include the DukaPilot heading");
  assert(home.html.includes("POS Tanzania"), "Home page does not include the public product metadata");
  assert(home.response.headers.get("strict-transport-security")?.includes("max-age=31536000"), "Home page is missing the production HSTS header");
  console.log("✓ Home page shell passed");

  const manifest = await request("/manifest.json");
  assert(manifest.response.ok, `Manifest request failed: ${manifest.response.status}`);
  assert(manifest.html.includes("DukaPilot"), "Manifest does not include the DukaPilot app name");
  console.log("✓ Manifest passed");

  const serviceWorker = await request("/sw.js");
  assert(serviceWorker.response.ok, `Service worker failed: ${serviceWorker.response.status}`);
  assert(serviceWorker.response.headers.get("cache-control")?.includes("no-cache"), "Service worker must bypass HTTP caches so live fixes reach existing users");
  console.log("Service-worker update policy passed");

  console.log("Frontend smoke test completed successfully.");
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
