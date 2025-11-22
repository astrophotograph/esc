import { z } from 'zod'

// Image Format Schema
export const ImageFormatSchema = z.enum(['fits', 'png', 'jpg', 'xisf'])
export type ImageFormat = z.infer<typeof ImageFormatSchema>

// FITS Header Schema
export const FitsHeaderSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
export type FitsHeader = z.infer<typeof FitsHeaderSchema>

// Image Metadata Schema
export const ImageMetadataSchema = z.object({
  id: z.string(),
  filename: z.string(),
  format: ImageFormatSchema,
  width: z.number(),
  height: z.number(),
  bitDepth: z.number().optional(),
  captureDate: z.string().optional(),
  exposure: z.number().optional(),
  filter: z.string().optional(),
  target: z.string().optional(),
  telescope: z.string().optional(),
  camera: z.string().optional(),
  fitsHeader: FitsHeaderSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ImageMetadata = z.infer<typeof ImageMetadataSchema>

// Image Data Schema (for full image with data)
export const ImageDataSchema = ImageMetadataSchema.extend({
  filePath: z.string(),
  thumbnailPath: z.string().optional(),
  previewPath: z.string().optional(),
})
export type ImageData = z.infer<typeof ImageDataSchema>

// Image Collection Schema
export const ImageCollectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  images: z.array(z.string()), // Array of image IDs
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ImageCollection = z.infer<typeof ImageCollectionSchema>

// Image Share Schema
export const ImageShareSchema = z.object({
  id: z.string(),
  imageId: z.string(),
  shareUrl: z.string(),
  expiresAt: z.string().optional(),
  createdAt: z.string(),
})
export type ImageShare = z.infer<typeof ImageShareSchema>
