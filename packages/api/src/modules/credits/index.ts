import type { FastifyInstance } from "fastify";
import creditRoutes from "./routes";

export default async function creditsModule(app: FastifyInstance) {
  app.register(creditRoutes, { prefix: "/credits" });
}

export {
  getOutstandingCreditLiability,
  grantPurchasedCredits,
  markCreditPurchaseFailed,
  quoteRedemptionValue,
  redeemForBooking,
  refundRedeemedCredits,
  // Exported for the compliance integration suite, which drives the real
  // transfer path to prove the CR-002 controls are wired to the ledger.
  transferCredits,
} from "./service";
export { getBalanceFor } from "./ledger";
