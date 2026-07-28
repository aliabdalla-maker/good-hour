export const ROLES = ["TRAVELLER", "SUPPLIER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

// The verticals a listing can belong to. A Property is the supplier's
// venue/fleet/desk; its Rooms are the bookable units (a room, a car, or a
// bookable travel service) — all booked by the hour on the same slot engine.
export const LISTING_CATEGORIES = ["ROOM", "CAR", "TRAVEL_SERVICE"] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

// A host is "Verified" only after an admin approves their submission.
export const VERIFICATION_STATUSES = ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

// CRM lifecycle stages for a customer (traveller or host).
export const CRM_STAGES = ["LEAD", "ACTIVE", "VIP", "DORMANT"] as const;
export type CrmStage = (typeof CRM_STAGES)[number];

export const SLOT_STATUSES = ["OPEN", "HELD", "BOOKED"] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

export const BOOKING_STATUSES = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
  "EXPIRED",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_SOURCES = ["DIRECT_SEARCH", "REVERSE_BID"] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

export const RATE_RULE_KINDS = ["WEEKEND", "PEAK", "CORPORATE", "AI_DYNAMIC"] as const;
export type RateRuleKind = (typeof RATE_RULE_KINDS)[number];

export const BOOKING_REQUEST_STATUSES = [
  "OPEN",
  "MATCHED",
  "EXPIRED",
  "CANCELLED",
] as const;
export type BookingRequestStatus = (typeof BOOKING_REQUEST_STATUSES)[number];

export const SUPPLIER_OFFER_STATUSES = [
  "PENDING",
  "RECOMMENDED",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
] as const;
export type SupplierOfferStatus = (typeof SUPPLIER_OFFER_STATUSES)[number];

export const AGENT_TYPES = ["PRICING", "NEGOTIATION", "IMAGE"] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export const NOTIFICATION_CHANNELS = ["IN_APP", "EMAIL", "SMS"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_CATEGORIES = ["TRANSACTIONAL", "MARKETING"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_STATUSES = ["QUEUED", "SENT", "FAILED"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const CAMPAIGN_AUDIENCES = ["ALL", "TRAVELLER", "SUPPLIER"] as const;
export type CampaignAudience = (typeof CAMPAIGN_AUDIENCES)[number];

export const SOURCED_DRAFT_STATUSES = ["DRAFT", "PUBLISHED", "DISCARDED"] as const;
export type SourcedDraftStatus = (typeof SOURCED_DRAFT_STATUSES)[number];

export const SOURCED_DRAFT_ORIGINS = ["URL", "FEED", "MANUAL", "SMOOBU"] as const;
export type SourcedDraftOrigin = (typeof SOURCED_DRAFT_ORIGINS)[number];

/**
 * The one account allowed into the ERP console (packages/web/app/admin/erp).
 * Deliberately a single hardcoded owner-operator address, not the broader
 * ADMIN role -- financial/payout data here is more sensitive than the CRM
 * console every ADMIN can already see.
 */
// Email lookups in this app are case-sensitive (no normalization on
// register/login), so this must match the stored value's exact casing.
export const ERP_ADMIN_EMAIL = "Admin@softwareequality.com";
