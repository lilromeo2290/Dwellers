/**
 * Dwellers — Shared zod validation primitives.
 *
 * Building blocks reused by every module's request schemas: money (integer
 * pesewas), Ghana phone numbers, slugs, references. Financial inputs are
 * ALWAYS integers in minor units — floats are rejected at the boundary.
 */
import { z } from 'zod'
import { isGhanaPhoneNumber, normalizeGhanaPhoneNumber } from '@/lib/constants/ghana'

/** Integer pesewas ≥ 0 (e.g. 150_00 = GH₵150.00). */
export const pesewasSchema = z.number().int('Money must be an integer amount of pesewas').min(0)

/** Optional integer pesewas (null clears the field). */
export const optionalPesewasSchema = pesewasSchema.nullable().optional()

/** Ghanaian mobile number, accepted local (0…) or international (+233…). */
export const ghanaPhoneSchema = z
  .string()
  .refine(isGhanaPhoneNumber, 'Enter a valid Ghanaian mobile number (e.g. 0241234567)')
  .transform((value) => normalizeGhanaPhoneNumber(value) as string)

export const optionalGhanaPhoneSchema = z
  .string()
  .refine(isGhanaPhoneNumber, 'Enter a valid Ghanaian mobile number (e.g. 0241234567)')
  .transform((value) => normalizeGhanaPhoneNumber(value) as string)
  .nullable()
  .optional()

/** URL-safe slug fragment. */
export const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers and dashes')

/** Safe text field: trimmed, length-bounded, no control characters. */
export function safeText(maxLength: number, label = 'This field') {
  return z
    .string()
    .trim()
    .max(maxLength, `${label} must be at most ${maxLength} characters`)
    .refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value), {
      message: `${label} contains invalid control characters`,
    })
}

export const optionalText = (maxLength: number, label = 'This field') =>
  safeText(maxLength, label).nullable().optional()

/** Positive integer id/quantity primitives. */
export const positiveIntSchema = z.number().int().positive()
export const nonNegativeIntSchema = z.number().int().min(0)

/** Status enum helpers (string status columns — values validated here). */
export function statusSchema<const T extends readonly string[]>(values: T) {
  return z.enum(values)
}
