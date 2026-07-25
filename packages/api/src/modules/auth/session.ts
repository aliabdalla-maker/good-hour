import { SignJWT, jwtVerify } from "jose";
import { config } from "../../config";
import type { Role } from "@gihtcx/shared";

const secret = new TextEncoder().encode(config.JWT_SECRET);
const SESSION_TTL = "7d";

export interface SessionPayload {
  sub: string;
  role: Role;
  isBusinessAccount: boolean;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role, isBusinessAccount: payload.isBusinessAccount })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secret);
  return {
    sub: payload.sub as string,
    role: payload.role as Role,
    isBusinessAccount: payload.isBusinessAccount as boolean,
  };
}
