import { z } from "zod";

export const generateListingImageSchema = z.object({
  prompt: z.string().min(3).max(300),
});
export type GenerateListingImageInput = z.infer<typeof generateListingImageSchema>;

export const generatedImageSchema = z.object({
  imageUrl: z.string(),
});
export type GeneratedImageView = z.infer<typeof generatedImageSchema>;
