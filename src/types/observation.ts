import { z } from 'zod'

// Observer Location Schema
export const ObserverLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  elevation: z.number().default(0),
  timezone: z.string().default('UTC'),
})
export type ObserverLocation = z.infer<typeof ObserverLocationSchema>

// Target Schema
export const TargetSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  ra: z.number().min(0).max(360),
  dec: z.number().min(-90).max(90),
  magnitude: z.number().nullable().optional(),
  type: z.enum(['star', 'galaxy', 'nebula', 'planet', 'cluster', 'other']).optional(),
})
export type Target = z.infer<typeof TargetSchema>

// Observation Session Schema
export const ObservationSessionSchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  location: ObserverLocationSchema,
  targets: z.array(TargetSchema),
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ObservationSession = z.infer<typeof ObservationSessionSchema>

// Visibility Window Schema
export const VisibilityWindowSchema = z.object({
  observable: z.boolean(),
  altitude_at_midpoint: z.number(),
})
export type VisibilityWindow = z.infer<typeof VisibilityWindowSchema>
