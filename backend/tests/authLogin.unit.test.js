const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const authPath = path.resolve(__dirname, "../src/controllers/auth.controller.js");

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test("login distinguishes an unregistered phone from an incorrect PIN", async () => {
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      user: { findFirst: async () => null },
      staffMember: { findFirst: async () => null },
    },
  };
  delete require.cache[authPath];
  const { login } = require(authPath);
  const res = response();

  await login({ body: { phone: "+255700000003", pin: "1234" } }, res, (error) => { throw error; });

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.payload, { error: "No account found for this phone number", code: "ACCOUNT_NOT_FOUND" });
});
