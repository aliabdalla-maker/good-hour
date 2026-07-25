import { zodToJsonSchema } from "zod-to-json-schema";
import { pricingDecisionSchema } from "@gihtcx/shared";

// Cast to `any` on input avoids zod-to-json-schema's excessively deep
// generic instantiation (TS2589); the runtime output is a plain JSON schema.
const parameters = zodToJsonSchema(pricingDecisionSchema as any) as Record<string, unknown>;

export const RECOMMEND_RATE_TOOL = {
  type: "function" as const,
  function: {
    name: "recommend_rate",
    description: "Submit the pricing recommendation for this room.",
    parameters,
  },
};
