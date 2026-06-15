const FRONTEND_URL = (process.env.MONITOR_FRONTEND_URL || "https://www.dukapilot.com").replace(/\/$/, "");
const API_URL = (process.env.MONITOR_API_URL || "https://dukapilotproduction.up.railway.app").replace(/\/$/, "");
const LOGIN_PHONE = process.env.MONITOR_LOGIN_PHONE || "+255700000002";
const LOGIN_PIN = process.env.MONITOR_LOGIN_PIN || "1234";
const STALE_RAILWAY_API_HOST = ["dukaos", "production.up.railway.app"].join("-");

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  return { response, payload };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(name, fn) {
  const start = Date.now();
  try {
    await fn();
    console.log(`OK ${name} (${Date.now() - start}ms)`);
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message || error}`);
    process.exitCode = 1;
  }
}

async function run() {
  console.log(`Monitoring frontend ${FRONTEND_URL}`);
  console.log(`Monitoring API ${API_URL}`);

  await check("backend health", async () => {
    const { response, payload } = await request(`${API_URL}/health`);
    assert(response.ok, `expected 2xx, got ${response.status}`);
    assert(payload.status === "ok" && payload.service === "DukaPilot API", "unexpected health payload");
  });

  await check("frontend shell", async () => {
    const { response, payload } = await request(`${FRONTEND_URL}/`);
    assert(response.ok, `expected 2xx, got ${response.status}`);
    assert(String(payload).includes("DukaPilot"), "frontend shell missing DukaPilot");
    assert(!String(payload).includes(STALE_RAILWAY_API_HOST), "frontend shell includes stale Railway API URL");
  });

  await check("catalog load", async () => {
    const [{ response: page }, { response: products, payload }] = await Promise.all([
      request(`${FRONTEND_URL}/catalog`),
      request(`${API_URL}/api/public/products`),
    ]);
    assert(page.ok, `catalog page expected 2xx, got ${page.status}`);
    assert(products.ok, `public products expected 2xx, got ${products.status}`);
    assert(Array.isArray(payload.products), "public products payload missing products array");
  });

  await check("CORS preflight", async () => {
    const { response } = await request(`${API_URL}/api/public/products`, {
      method: "OPTIONS",
      headers: {
        Origin: FRONTEND_URL,
        "Access-Control-Request-Method": "GET",
      },
    });
    assert(response.status === 204, `expected 204, got ${response.status}`);
    assert(response.headers.get("access-control-allow-origin") === FRONTEND_URL, "CORS allow-origin mismatch");
  });

  let token = "";
  await check("login", async () => {
    const { response, payload } = await request(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: FRONTEND_URL },
      body: JSON.stringify({ phone: LOGIN_PHONE, pin: LOGIN_PIN }),
    });
    assert(response.ok, `login expected 2xx, got ${response.status} ${JSON.stringify(payload)}`);
    assert(payload.token, "login response missing token");
    token = payload.token;
  });

  await check("authenticated dashboard", async () => {
    const { response, payload } = await request(`${API_URL}/api/dashboard?period=today`, {
      headers: { Authorization: `Bearer ${token}`, Origin: FRONTEND_URL },
    });
    assert(response.ok, `dashboard expected 2xx, got ${response.status}`);
    assert(payload.summary, "dashboard payload missing summary");
  });

  await check("failed API path stays controlled", async () => {
    const { response, payload } = await request(`${API_URL}/api/auth/me`, {
      headers: { Authorization: "Bearer invalid-token", Origin: FRONTEND_URL },
    });
    assert(response.status === 401, `expected 401, got ${response.status}`);
    assert(payload.error, "401 payload missing error");
  });
}

run().then(() => {
  if (process.exitCode) process.exit(process.exitCode);
  console.log("Production monitor completed successfully.");
});
