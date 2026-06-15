import { createHttpServer } from "../api/http.js";
import { loadConfig } from "./config.js";

export function createServer() {
  return createHttpServer();
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href) {
  const config = loadConfig();
  const server = createServer();

  server.listen(config.port, () => {
    console.log(`AtendeAI API listening on port ${config.port}`);
  });
}
