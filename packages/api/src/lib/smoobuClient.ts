import { randomUUID, createHash, createHmac } from "node:crypto";
import { config } from "../config";

const BASE_URL = "https://login.smoobu.com";

export interface SmoobuApartmentSummary {
  id: number;
  name: string;
}

export interface SmoobuApartment {
  id: number;
  name: string;
  location: {
    street: string | null;
    city: string | null;
    country: string | null;
  };
  amenities: string[];
  currency: string;
  price: { minimal: string; maximal: string };
}

/**
 * Signs and sends one request per Smoobu's HMAC auth scheme: a canonical
 * string of METHOD/PATH/QUERY/TIMESTAMP/NONCE/BODY_HASH/API_KEY, HMAC-SHA256'd
 * with the API secret and base64-encoded. See https://docs.smoobu.com/ —
 * this is the "recommended" auth path (Legacy API-Key auth is deprecated).
 */
async function signedRequest<T>(method: "GET", path: string): Promise<T> {
  if (!config.SMOOBU_API_KEY || !config.SMOOBU_API_SECRET) {
    throw new Error("SMOOBU_API_KEY / SMOOBU_API_SECRET is not configured");
  }

  const timestamp = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const nonce = randomUUID();
  const bodyHash = createHash("sha256").update("").digest("hex");
  const canonical = [method, path, "", timestamp, nonce, bodyHash, config.SMOOBU_API_KEY].join("\n");
  const signature = createHmac("sha256", config.SMOOBU_API_SECRET).update(canonical).digest("base64");

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "X-API-Key": config.SMOOBU_API_KEY,
      "X-Timestamp": timestamp,
      "X-Nonce": nonce,
      "X-Signature": signature,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Smoobu API request failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export async function listApartments(): Promise<SmoobuApartmentSummary[]> {
  const { apartments } = await signedRequest<{ apartments: SmoobuApartmentSummary[] }>("GET", "/api/apartments");
  return apartments;
}

export async function getApartment(id: number): Promise<SmoobuApartment> {
  return signedRequest<SmoobuApartment>("GET", `/api/apartment/${id}`);
}
