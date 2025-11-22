import { z } from 'zod'

// Telescope Protocol Schema
export const TelescopeProtocolSchema = z.enum(['ascom', 'indi', 'alpaca'])
export type TelescopeProtocol = z.infer<typeof TelescopeProtocolSchema>

// Telescope Status Schema
export const TelescopeStatusSchema = z.object({
  connected: z.boolean(),
  tracking: z.boolean(),
  slewing: z.boolean(),
  parked: z.boolean(),
  ra: z.number().nullable(),
  dec: z.number().nullable(),
  alt: z.number().nullable(),
  az: z.number().nullable(),
})
export type TelescopeStatus = z.infer<typeof TelescopeStatusSchema>

// Telescope Connection Schema
export const TelescopeConnectionSchema = z.object({
  protocol: TelescopeProtocolSchema,
  deviceId: z.string(),
})
export type TelescopeConnection = z.infer<typeof TelescopeConnectionSchema>

// Coordinate Schema
export const CoordinateSchema = z.object({
  ra: z.number().min(0).max(360),
  dec: z.number().min(-90).max(90),
})
export type Coordinate = z.infer<typeof CoordinateSchema>

// Alt-Az Coordinate Schema
export const AltAzCoordinateSchema = z.object({
  altitude: z.number().min(0).max(90),
  azimuth: z.number().min(0).max(360),
})
export type AltAzCoordinate = z.infer<typeof AltAzCoordinateSchema>
