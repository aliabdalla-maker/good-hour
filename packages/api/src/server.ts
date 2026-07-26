import { buildApp } from "./app";
import { config } from "./config";

async function main() {
  const app = buildApp();

  try {
    // Hosts like Render/Railway inject PORT and route to it; fall back to API_PORT locally.
    const port = Number(process.env.PORT) || config.API_PORT;
    await app.listen({ port, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

main();
