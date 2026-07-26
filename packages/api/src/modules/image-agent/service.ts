import type { GenerateListingImageInput, GeneratedImageView } from "@gihtcx/shared";
import { featureFlags } from "../../config";
import { AppError } from "../../plugins/errorHandler";
import { generateImage } from "../../lib/geminiClient";
import { logAgentDecision } from "../agent-log";

const PROMPT_VERSION = "image-agent.v1";
const TIMEOUT_MS = 20_000;

/**
 * Generate one listing photo with Gemini ("Nano Banana"). Unlike the pricing
 * and negotiation agents, there is no sensible non-AI fallback for "produce an
 * image" — if this isn't configured or the call fails, callers get a clear
 * error and the supplier falls back to pasting an image URL manually (already
 * supported everywhere Room.imageUrl is set). Every attempt is still logged,
 * success or failure, same as the other two agents.
 */
export async function generateListingImage(
  supplierId: string,
  input: GenerateListingImageInput
): Promise<GeneratedImageView> {
  if (!featureFlags.imageGenEnabled) {
    throw new AppError(503, "AI image generation is not configured", "IMAGE_GEN_UNAVAILABLE");
  }

  const started = Date.now();
  const styledPrompt = `Professional real-estate/travel marketplace listing photo. ${input.prompt}. Bright, realistic, high quality, no text or watermarks overlaid.`;

  try {
    const result = await Promise.race([
      generateImage(styledPrompt),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("image generation timeout")), TIMEOUT_MS)),
    ]);

    await logAgentDecision({
      agentType: "IMAGE",
      subjectType: "Supplier",
      subjectId: supplierId,
      inputSnapshot: { prompt: input.prompt },
      promptVersion: PROMPT_VERSION,
      modelUsed: "gemini-2.5-flash-image",
      // Never store the base64 image bytes in the audit log -- just metadata.
      rawModelOutput: { mimeType: result.mimeType, approxBytes: result.bytes },
      parsedDecision: { generated: true },
      latencyMs: Date.now() - started,
    });

    return { imageUrl: result.dataUrl };
  } catch (error) {
    await logAgentDecision({
      agentType: "IMAGE",
      subjectType: "Supplier",
      subjectId: supplierId,
      inputSnapshot: { prompt: input.prompt },
      promptVersion: PROMPT_VERSION,
      modelUsed: "gemini-2.5-flash-image",
      rawModelOutput: { error: error instanceof Error ? error.message : String(error) },
      parsedDecision: { generated: false },
      latencyMs: Date.now() - started,
    });
    throw new AppError(502, "Image generation failed — try a different description, or paste an image URL instead.", "IMAGE_GEN_FAILED");
  }
}
