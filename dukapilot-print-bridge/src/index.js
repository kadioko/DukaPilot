const { readConfig } = require("./config");
const { createBridgeServer } = require("./server");

const config = readConfig();
const server = createBridgeServer(config);
server.listen(config.port, config.host, () => {
  console.log(`DukaPilot Print Bridge listening at http://${config.host}:${config.port}`);
});
