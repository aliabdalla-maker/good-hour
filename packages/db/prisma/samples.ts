/**
 * Production-safe sample listings, so a brand-new site isn't an empty page.
 *
 * Runs on every deploy (after migrations) and is idempotent. Unlike seed.ts it
 * creates NO login-able accounts: the sample host gets a random, never-stored
 * password, and every listing is clearly named "Sample" with status SAMPLE on
 * the property. The booking service refuses SAMPLE properties, so nobody can
 * pay for something that does not exist.
 *
 *   SAMPLE_LISTINGS=on   (default) create/re-show the samples
 *   SAMPLE_LISTINGS=off  hide them (rooms set INACTIVE) once real hosts list
 *
 * Failures are logged and swallowed: a sample-data problem must never stop
 * the real API from starting.
 */
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { prisma } from "../src/client";

const SAMPLE_HOST_EMAIL = "samples@goodhour.shop";
const IMG = (name: string) => `/listings/${name}.jpg`;

type Category = "ROOM" | "CAR" | "TRAVEL_SERVICE";
interface SampleRoom {
  name: string;
  capacity: number;
  amenities: string[];
  imageUrl: string;
  baseHourlyRate: number;
  minHours: number;
  maxHours: number;
}
interface SampleProperty {
  name: string;
  category: Category;
  city: string;
  lat: number;
  lng: number;
  amenities: string[];
  rooms: SampleRoom[];
}

const SAMPLES: SampleProperty[] = [
  {
    name: "Sample: Day rooms near King's Cross",
    category: "ROOM",
    city: "London",
    lat: 51.5308,
    lng: -0.1238,
    amenities: ["wifi", "24h_reception", "luggage_storage"],
    rooms: [
      { name: "Sample double room", capacity: 2, amenities: ["wifi", "shower", "desk"], imageUrl: IMG("room"), baseHourlyRate: 18, minHours: 2, maxHours: 10 },
      { name: "Sample executive suite", capacity: 2, amenities: ["wifi", "shower", "lounge", "coffee"], imageUrl: IMG("suite"), baseHourlyRate: 32, minHours: 2, maxHours: 12 },
    ],
  },
  {
    name: "Sample: Meeting room in Shoreditch",
    category: "ROOM",
    city: "London",
    lat: 51.5246,
    lng: -0.0784,
    amenities: ["wifi", "screen", "whiteboard"],
    rooms: [
      { name: "Sample 6-seat meeting room", capacity: 6, amenities: ["wifi", "screen", "whiteboard", "coffee"], imageUrl: IMG("office"), baseHourlyRate: 25, minHours: 1, maxHours: 9 },
    ],
  },
  {
    name: "Sample: Car hire at Manchester Piccadilly",
    category: "CAR",
    city: "Manchester",
    lat: 53.4774,
    lng: -2.2309,
    amenities: ["free_cancellation", "insurance_included"],
    rooms: [
      { name: "Sample electric saloon", capacity: 5, amenities: ["electric", "automatic", "satnav"], imageUrl: IMG("tesla"), baseHourlyRate: 14, minHours: 2, maxHours: 24 },
      { name: "Sample small van", capacity: 3, amenities: ["manual", "load_space"], imageUrl: IMG("van"), baseHourlyRate: 12, minHours: 2, maxHours: 24 },
    ],
  },
  {
    name: "Sample: Edinburgh transfers and guided walks",
    category: "TRAVEL_SERVICE",
    city: "Edinburgh",
    lat: 55.9533,
    lng: -3.1883,
    amenities: ["english_speaking", "meet_and_greet"],
    rooms: [
      { name: "Sample airport transfer", capacity: 4, amenities: ["meet_and_greet", "luggage"], imageUrl: IMG("transfer"), baseHourlyRate: 35, minHours: 1, maxHours: 4 },
      { name: "Sample Old Town walking guide", capacity: 8, amenities: ["english_speaking", "history"], imageUrl: IMG("tour"), baseHourlyRate: 28, minHours: 2, maxHours: 6 },
    ],
  },
];

async function main() {
  const mode = (process.env.SAMPLE_LISTINGS ?? "on").trim().toLowerCase();

  if (mode === "off") {
    const hidden = await prisma.room.updateMany({
      where: { property: { status: "SAMPLE" }, status: "ACTIVE" },
      data: { status: "INACTIVE" },
    });
    console.log(`[samples] SAMPLE_LISTINGS=off: hid ${hidden.count} sample listing(s)`);
    return;
  }

  // Random password that is hashed and immediately forgotten: nobody can log in.
  const host = await prisma.user.upsert({
    where: { email: SAMPLE_HOST_EMAIL },
    update: {},
    create: {
      email: SAMPLE_HOST_EMAIL,
      passwordHash: await argon2.hash(randomBytes(32).toString("hex")),
      role: "SUPPLIER",
      marketingOptIn: false,
    },
  });

  let created = 0;
  for (const p of SAMPLES) {
    const existing = await prisma.property.findFirst({ where: { supplierId: host.id, name: p.name } });
    if (existing) {
      // Re-show anything hidden by a previous SAMPLE_LISTINGS=off.
      await prisma.room.updateMany({ where: { propertyId: existing.id, status: "INACTIVE" }, data: { status: "ACTIVE" } });
      continue;
    }
    await prisma.property.create({
      data: {
        supplierId: host.id,
        status: "SAMPLE",
        name: p.name,
        category: p.category,
        addressLine: "Sample listing, not a real venue",
        city: p.city,
        country: "UK",
        lat: p.lat,
        lng: p.lng,
        amenities: p.amenities,
        rooms: { create: p.rooms.map((r) => ({ ...r, currency: "GBP", imageIsAiGenerated: false })) },
      },
    });
    created += 1;
  }
  console.log(`[samples] ensured ${SAMPLES.length} sample properties (${created} new)`);
}

main()
  .catch((error) => {
    console.error("[samples] skipped (non-fatal):", error instanceof Error ? error.message : error);
  })
  .finally(() => prisma.$disconnect());
