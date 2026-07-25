import { buildApp } from "./app";
import { config } from "./config";

async function main() {
  const app = buildApp();

  try {
    await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

main();
