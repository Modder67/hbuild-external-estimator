import { z } from "zod";

// H Draft's signed GET /api/hooks/projects/:id response (the inner data object).
// Do not confuse this upstream contract with this app's /mesh/projects/:id/details response.
export const DraftHookProjectDetails = z.object({
  projectId: z.string().uuid(),
  jobCode: z.string().nullable(),
  client: z.object({
    id: z.string(),
    name: z.string(),
    address: z.object({
      line1: z.string().nullish(),
      line2: z.string().nullish(),
      city: z.string().nullish(),
      state: z.string().nullish(),
      postalCode: z.string().nullish(),
    }).nullable().optional(),
  }).nullable(),
});