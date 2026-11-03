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
export const COHORT_OPTIONS = ["UGC 1", "UGC 2"] as const;

/**
 * Configurable allowed email domains (lowercase).
 * Leave empty (`[]`) to allow any valid email domain.
 */
export const ALLOWED_EMAIL_DOMAINS: readonly string[] = [];

export function validateEmail(raw?: string | null): { valid: boolean; email: string | null; error?: string } {
  if (!raw || !raw.trim()) {
    return { valid: true, email: null };
  }
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

/**
 * Properly encodes all UPI URI parameters using standard percent-encoding (%20 for spaces).
 */
export function buildUpiQueryParams(reference?: string): string {
  const note = reference
    ? `Titu Backpackers Coorg Trip ${reference}`.slice(0, 50)
    : "Titu Backpackers Coorg Trip";
  const entries: [string, string][] = [
    ["pa", TRIP.upiId],
    ["am", String(TRIP.price)],
    ["cu", "INR"],
    ["tn", note],
  ];
  return entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

/**
 * Standard UPI deep link (used on Android to open the system UPI chooser for GPay, PhonePe, Paytm, or bank apps).
 * Note: On iOS, the generic `upi://` scheme is claimed by WhatsApp in Info.plist (`LSApplicationQueriesSchemes`/`CFBundleURLSchemes`),
 * so iOS Safari must NOT navigate to `upi://pay` directly.
 */
export function buildUpiLink(reference?: string) {
  return `upi://pay?${buildUpiQueryParams(reference)}`;
}

/**
 * App-specific iOS UPI deep links for major Indian UPI apps (never includes WhatsApp).
 */
export function buildIosUpiAppLinks(reference?: string) {
  const query = buildUpiQueryParams(reference);
  return {
    gpay: `tez://upi/pay?${query}`,
    phonepe: `phonepe://pay?${query}`,
    paytm: `paytmmp://pay?${query}`,
    bhim: `bhim://pay?${query}`,
  } as const;
}

export type DevicePlatform = "ios" | "android" | "desktop";

export function detectDevicePlatform(
  userAgent: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
  maxTouchPoints: number = typeof navigator !== "undefined" ? navigator.maxTouchPoints ?? 0 : 0,
): DevicePlatform {
  if (/android/i.test(userAgent)) return "android";
  if (/iPad|iPhone|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) {
    return "ios";
  }
  return "desktop";
}

export const STATUS_LABEL: Record<string, string> = {
  registration_started: "Registration Started",
  email_verified: "Email Verified",
  pending_verification: "Pending Payment Verification",
  confirmed: "Confirmed",
  rejected: "Rejected / Needs Review",
};

