import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config";

/**
 * A deterministic, stateless unsubscribe token: an HMAC of the user id keyed
 * by the app secret. No DB storage needed, and it can't be forged without the
 * secret. Used for one-click unsubscribe links in marketing emails.
 */
export function makeUnsubToken(userId: string): string {
  return createHmac("sha256", config.JWT_SECRET).update(`unsub:${userId}`).digest("base64url");
}

export function verifyUnsubToken(userId: string, token: string): boolean {
  const expected = Buffer.from(makeUnsubToken(userId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function unsubscribeUrl(userId: string): string {
  return `${config.API_PUBLIC_URL}/notifications/unsubscribe?u=${encodeURIComponent(userId)}&t=${makeUnsubToken(userId)}`;
}
