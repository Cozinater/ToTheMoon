import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const SESSION_COOKIE = "ttm_session";
export const SESSION_MAX_AGE = 2592000; // 30 days
export const LOGIN_FAILURE_DELAY_MS = 500;

export const loginInputSchema = z.object({ password: z.string().min(1) });

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time comparison via equal-length SHA-256 digests. */
export function passwordMatches(submitted: string, expected: string): boolean {
  return timingSafeEqual(sha256(submitted), sha256(expected));
}
