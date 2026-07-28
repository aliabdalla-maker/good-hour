import type { FastifyInstance } from "fastify";
import walletRoutes from "./routes";

export default async function walletModule(app: FastifyInstance) {
  app.register(walletRoutes, { prefix: "/wallet" });
}

export { creditTopUp, markTopUpFailed, getWalletLiability } from "./service";
export { getMoneyBalance, applyWalletWrites } from "./ledger";
