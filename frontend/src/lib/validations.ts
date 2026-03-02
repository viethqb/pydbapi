/**
 * Shared Zod validation schemas for forms across the app.
 */

import { z } from "zod"

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

/** Required password: non-empty, min 8 characters. */
export const passwordSchema = z
  .string()
  .min(1, { message: "Password is required" })
  .min(8, { message: "Password must be at least 8 characters" })

/** Optional password for edit forms: empty string or min 8 characters. */
export const optionalPasswordSchema = z
  .string()
  .min(8, { message: "Password must be at least 8 characters" })
  .optional()
  .or(z.literal(""))

/** Confirmation field (required). */
export const confirmPasswordSchema = z
  .string()
  .min(1, { message: "Password confirmation is required" })

/**
 * Refine helper: checks that `password` and `confirm_password` match.
 * Use with `.refine(passwordsMatch, passwordsMismatchError)`.
 */
export const passwordsMatch = (data: {
  password?: string
  confirm_password?: string
  new_password?: string
}) => {
  const pw = data.new_password ?? data.password
  return !pw || pw === data.confirm_password
}

export const passwordsMismatchError = {
  message: "The passwords don't match",
  path: ["confirm_password"] as [string, ...string[]],
}

// ---------------------------------------------------------------------------
// Username
// ---------------------------------------------------------------------------

/** Required username: non-empty, max 150 characters. */
export const usernameSchema = z
  .string()
  .min(1, { message: "Username is required" })
  .max(150, { message: "Username must be at most 150 characters" })

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/** Email with a user-friendly error message. */
export const emailSchema = z.email({ message: "Invalid email address" })

/** Optional email for forms where email is not required. */
export const optionalEmailSchema = z
  .string()
  .email({ message: "Invalid email address" })
  .optional()
  .or(z.literal(""))
