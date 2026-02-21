import { z } from "zod";

export const sourceTypeSchema = z.enum(["leadership", "assets", "unknown"]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const personTypeSchema = z.enum(["executive", "board", "unknown"]);
export type PersonType = z.infer<typeof personTypeSchema>;

export const assetStatusSchema = z.enum([
  "operating",
  "development",
  "care_and_maintenance",
  "closed",
  "exploration",
  "unknown",
]);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

export const runInputSchema = z.object({
  input: z.string().min(1, "input is required"),
});
export type RunInput = z.infer<typeof runInputSchema>;

export const leadershipPersonSchema = z.object({
  full_name: z.string().min(1),
  title: z.string().trim().min(1).nullable(),
  type: personTypeSchema.default("unknown"),
  expertise_tags: z.array(z.string().min(1)).default([]),
  bullets: z.array(z.string().min(1)).default([]),
});
export type LeadershipPerson = z.infer<typeof leadershipPersonSchema>;

export const leadershipExtractionSchema = z.object({
  people: z.array(leadershipPersonSchema).default([]),
});
export type LeadershipExtraction = z.infer<typeof leadershipExtractionSchema>;

export const assetSchema = z.object({
  name: z.string().min(1),
  commodities: z.array(z.string().min(1)).default([]),
  status: z.string().trim().min(1).nullable(),
  country: z.string().trim().min(1).nullable(),
  region: z.string().trim().min(1).nullable(),
  town: z.string().trim().min(1).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  notes: z.string().trim().min(1).nullable(),
});
export type ExtractedAsset = z.infer<typeof assetSchema>;

export const assetsExtractionSchema = z.object({
  assets: z.array(assetSchema).default([]),
});
export type AssetsExtraction = z.infer<typeof assetsExtractionSchema>;

export const companyIdSchema = z.string().uuid();

export const companyListItemSchema = z.object({
  id: companyIdSchema,
  name: z.string(),
  created_at: z.string(),
});
export type CompanyListItem = z.infer<typeof companyListItemSchema>;
