import type { FastifyInstance } from "fastify";
import creditRoutes from "./routes";

export default async function creditsModule(app: FastifyInstance) {
  app.register(creditRoutes, { prefix: "/credits" });
}

export {
  getOutstandingCreditLiability,
  grantPurchasedCredits,
  markCreditPurchaseFailed,
  redeemForBooking,
  refundRedeemedCredits,
} from "./service";
export { getBalanceFor } from "./ledger";
