export const TRIP = {
  brand: "TITU BACKPACKERS",
  destination: "Coorg",
  dates: "20–22 November 2026",
  price: 8500,
  priceLabel: "₹8,500",
  upiId: "gatepay.nkgsbank725538@icici",
  instagram: "titubagpackers",
  policyVersion: "2026-11-v1",
} as const;

/** Configurable cohort options for registration dropdown. */
export const COHORT_OPTIONS = ["Section A", "Section B"] as const;

/**
 * Configurable allowed email domains (lowercase).
 * Leave empty (`[]`) to allow any valid email domain.
 */
export const ALLOWED_EMAIL_DOMAINS: readonly string[] = [];

export function validateEmail(raw: string): { valid: boolean; email: string; error?: string } {
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { valid: false, email, error: "Please enter a valid email address" };
  }
  if (ALLOWED_EMAIL_DOMAINS.length > 0) {
    const domain = email.split("@")[1] ?? "";
    if (!ALLOWED_EMAIL_DOMAINS.includes(domain)) {
      return {
        valid: false,
        email,
        error: `Please use an approved email domain (${ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(", ")})`,
      };
    }
  }
  return { valid: true, email };
}

/**
 * Validates and normalizes an Indian mobile number.
 * Supports optional +91 or 91 prefix, spaces, and hyphens, normalizing to +91XXXXXXXXXX.
 */
export function normalizeIndianPhone(raw: string): { valid: boolean; phone: string; error?: string } {
  const cleaned = raw.replace(/[\s\-()]/g, "");
  const match = /^(?:\+91|91|0)?([6-9][0-9]{9})$/.exec(cleaned);
  if (!match) {
    return {
      valid: false,
      phone: cleaned,
      error: "Please enter a valid 10-digit Indian mobile number (e.g. +91 98765 43210)",
    };
  }
  return { valid: true, phone: `+91${match[1]}` };
}

/** Standard UPI deep link. No payee name is invented. */
export function buildUpiLink(reference: string) {
  const params = new URLSearchParams({
    pa: TRIP.upiId,
    am: String(TRIP.price),
    cu: "INR",
    tn: `COORG2026 ${reference}`.slice(0, 50),
  });
  return `upi://pay?${params.toString()}`;
}

export const STATUS_LABEL: Record<string, string> = {
  registration_started: "Registration Started",
  email_verified: "Email Verified",
  pending_verification: "Pending Payment Verification",
  confirmed: "Confirmed",
  rejected: "Rejected / Needs Review",
};

