import { zodToJsonSchema } from "zod-to-json-schema";
import { matchDecisionSchema } from "@gihtcx/shared";

// Cast to `any` on input avoids zod-to-json-schema's excessively deep
// generic instantiation (TS2589); the runtime output is a plain JSON schema.
const parameters = zodToJsonSchema(matchDecisionSchema as any) as Record<string, unknown>;

export const EVALUATE_OFFERS_TOOL = {
  type: "function" as const,
  function: {
    name: "evaluate_offers",
    description: "Submit the ranked recommendation for this booking request's offers.",
    parameters,
  },
};
