import { config } from "../config";

export interface GeneratedImage {
  dataUrl: string;
  mimeType: string;
  bytes: number;
}

/**
 * Generate one image with Gemini 2.5 Flash Image ("Nano Banana") via a plain
 * REST call — no SDK dependency, matching this repo's preference for fetch
 * over adding packages. Throws if unconfigured or on any API error; callers
 * (image-agent/service.ts) are responsible for the fallback behaviour.
 */
export async function generateImage(prompt: string): Promise<GeneratedImage> {
  if (!config.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_IMAGE_MODEL}:generateContent?key=${config.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini image generation failed: ${res.status} ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  const parts: Array<Record<string, { data?: string; mimeType?: string; mime_type?: string }>> =
    json?.candidates?.[0]?.content?.parts ?? [];
  // Google's proto-JSON mapping is camelCase (inlineData), but be defensive
  // about the snake_case form too in case that ever changes upstream.
  const inline = parts.map((p) => p.inlineData ?? p.inline_data).find((v) => v?.data);

  if (!inline?.data) {
    throw new Error("Gemini response contained no image data");
  }
  const mimeType = inline.mimeType ?? inline.mime_type ?? "image/png";

  return { dataUrl: `data:${mimeType};base64,${inline.data}`, mimeType, bytes: Math.floor((inline.data.length * 3) / 4) };
}
