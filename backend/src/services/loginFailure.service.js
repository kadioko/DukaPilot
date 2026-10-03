const prisma = require("../lib/prisma");

function recordLoginFailure(reason) {
  // Aggregate operational signal only: never retain the attempted phone, PIN, or IP.
  void prisma.loginFailureEvent.create({ data: { reason } }).catch((error) => {
    console.error("Failed to record login failure", error);
  });
}

module.exports = { recordLoginFailure };
