const test = require("node:test");
const assert = require("node:assert/strict");

const { isSmsConfigured } = require("../src/services/otp.service");

test("live SMS requires an API key and a non-sandbox username", () => {
  const originalKey = process.env.AT_API_KEY;
  const originalUsername = process.env.AT_USERNAME;
  try {
    delete process.env.AT_API_KEY;
    process.env.AT_USERNAME = "sandbox";
    assert.equal(isSmsConfigured(), false);
    process.env.AT_API_KEY = "configured";
    assert.equal(isSmsConfigured(), false);
    process.env.AT_USERNAME = "dukapilot";
    assert.equal(isSmsConfigured(), true);
  } finally {
    if (originalKey === undefined) delete process.env.AT_API_KEY; else process.env.AT_API_KEY = originalKey;
    if (originalUsername === undefined) delete process.env.AT_USERNAME; else process.env.AT_USERNAME = originalUsername;
  }
});
