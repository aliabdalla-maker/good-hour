import argon2 from "argon2";
import { prisma } from "../src/client";

async function main() {
  const passwordHash = await argon2.hash("password123");

  const supplier = await prisma.user.upsert({
    where: { email: "supplier@example.com" },
    update: { verificationStatus: "VERIFIED", verifiedAt: new Date() },
    create: {
      email: "supplier@example.com",
      passwordHash,
      role: "SUPPLIER",
      verificationStatus: "VERIFIED",
      verifiedAt: new Date(),
    },
  });

  const traveller = await prisma.user.upsert({
    where: { email: "traveller@example.com" },
    update: {},
    create: {
      email: "traveller@example.com",
      passwordHash,
      role: "TRAVELLER",
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      passwordHash,
      role: "ADMIN",
    },
  });

  // Idempotent: only create the demo property + rooms if they don't exist yet,
  // so re-running the seed doesn't duplicate the catalogue.
  const existingProperty = await prisma.property.findFirst({
    where: { supplierId: supplier.id, name: "Heathrow Airport Business Hotel" },
  });

  const property =
    existingProperty ??
    (await prisma.property.create({
      data: {
        supplierId: supplier.id,
        name: "Heathrow Airport Business Hotel",
        addressLine: "1 Airport Way",
        city: "London",
        country: "UK",
        lat: 51.47,
        lng: -0.4543,
        amenities: ["wifi", "parking", "24h_reception"],
        rooms: {
          create: [
            {
              name: "Day-Use Business Room",
              capacity: 2,
              amenities: ["wifi", "desk", "blackout_blinds"],
              baseHourlyRate: 18.5,
              currency: "GBP",
              minHours: 2,
              maxHours: 12,
            },
            {
              name: "Executive Suite",
              capacity: 4,
              amenities: ["wifi", "parking", "meeting_table", "spa_access"],
              baseHourlyRate: 42,
              currency: "GBP",
              minHours: 3,
              maxHours: 24,
            },
          ],
        },
      },
    }));

  // --- Car rental vertical: a "property" is the supplier's fleet/depot,
  // its "rooms" are individual vehicles booked by the hour. ---
  const existingFleet = await prisma.property.findFirst({
    where: { supplierId: supplier.id, name: "Heathrow City Car Hire" },
  });
  const fleet =
    existingFleet ??
    (await prisma.property.create({
      data: {
        supplierId: supplier.id,
        name: "Heathrow City Car Hire",
        category: "CAR",
        addressLine: "Car Rental Village, Terminal 5",
        city: "London",
        country: "UK",
        lat: 51.4723,
        lng: -0.4894,
        amenities: ["fuel_included", "24h_pickup", "unlimited_mileage"],
        rooms: {
          create: [
            {
              name: "Tesla Model 3 (Electric)",
              capacity: 5,
              amenities: ["automatic", "gps", "autopilot", "electric"],
              baseHourlyRate: 12.0,
              currency: "GBP",
              minHours: 2,
              maxHours: 24,
            },
            {
              name: "VW Transporter Van",
              capacity: 3,
              amenities: ["manual", "large_boot", "diesel"],
              baseHourlyRate: 9.5,
              currency: "GBP",
              minHours: 3,
              maxHours: 24,
            },
          ],
        },
      },
    }));

  // --- Travel services vertical: a "property" is the operator's desk, its
  // "rooms" are bookable services (transfers, tours) sold in time blocks. ---
  const existingDesk = await prisma.property.findFirst({
    where: { supplierId: supplier.id, name: "London Travel Concierge" },
  });
  const desk =
    existingDesk ??
    (await prisma.property.create({
      data: {
        supplierId: supplier.id,
        name: "London Travel Concierge",
        category: "TRAVEL_SERVICE",
        addressLine: "12 Piccadilly",
        city: "London",
        country: "UK",
        lat: 51.5079,
        lng: -0.1367,
        amenities: ["english_speaking", "instant_confirmation"],
        rooms: {
          create: [
            {
              name: "Private Airport Transfer",
              capacity: 4,
              amenities: ["meet_and_greet", "flight_tracking", "child_seat"],
              baseHourlyRate: 35.0,
              currency: "GBP",
              minHours: 1,
              maxHours: 6,
            },
            {
              name: "Guided City Walking Tour",
              capacity: 10,
              amenities: ["licensed_guide", "small_group", "tickets_included"],
              baseHourlyRate: 22.0,
              currency: "GBP",
              minHours: 2,
              maxHours: 8,
            },
          ],
        },
      },
    }));

  console.log("Seeded demo data:", {
    supplier: supplier.email,
    traveller: traveller.email,
    admin: admin.email,
    properties: [property.name, fleet.name, desk.name],
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
