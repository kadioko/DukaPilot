const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const standaloneRoot = path.join(root, ".next", "standalone");

function copyIfPresent(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, force: true });
}

// Next's standalone server expects static and public assets beside itself.
// Production deployment supplies these; the isolated Playwright server does too.
copyIfPresent(path.join(root, ".next", "static"), path.join(standaloneRoot, ".next", "static"));
copyIfPresent(path.join(root, "public"), path.join(standaloneRoot, "public"));

process.env.PORT ||= "3010";
process.env.HOSTNAME ||= "127.0.0.1";
require(path.join(standaloneRoot, "server.js"));
