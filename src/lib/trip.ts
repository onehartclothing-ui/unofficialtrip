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
