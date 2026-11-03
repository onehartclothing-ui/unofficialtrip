import { describe, it, expect } from "vitest";
import { buildUpiLink, TRIP, COHORT_OPTIONS, validateEmail, normalizeIndianPhone } from "./trip";

describe("UPI link", () => {
  it("pays the new UPI ID", () => {
    const u = new URL(buildUpiLink("TB-COORG-ABC123").replace("upi://", "https://x/"));
    expect(u.searchParams.get("pa")).toBe("gatepay.nkgsbank725538@icici");
  });
  it("charges the full ₹8,500 in INR", () => {
    const u = new URL(buildUpiLink("X").replace("upi://", "https://x/"));
    expect(u.searchParams.get("am")).toBe("8500");
    expect(u.searchParams.get("cu")).toBe("INR");
  });
  it("includes the booking reference as note and no payee name", () => {
    const u = new URL(buildUpiLink("TB-COORG-ABC123").replace("upi://", "https://x/"));
    expect(u.searchParams.get("tn")).toContain("TB-COORG-ABC123");
    expect(u.searchParams.get("pn")).toBeNull();
  });
  it("price constant is 8500", () => expect(TRIP.price).toBe(8500));
});

describe("Registration helpers", () => {
  it("exposes configurable cohort options", () => {
    expect(COHORT_OPTIONS.length).toBeGreaterThan(0);
    expect(COHORT_OPTIONS).toContain("UGC 1");
    expect(COHORT_OPTIONS).toContain("UGC 2");
  });

  it("validates email format", () => {
    expect(validateEmail("student@mesa.edu").valid).toBe(true);
    expect(validateEmail("  Student@Example.com ").email).toBe("student@example.com");
    expect(validateEmail("not-an-email").valid).toBe(false);
  });

  it("validates and normalizes Indian mobile numbers with +91 support", () => {
    expect(normalizeIndianPhone("+91 98765 43210")).toEqual({ valid: true, phone: "+919876543210" });
    expect(normalizeIndianPhone("9876543210")).toEqual({ valid: true, phone: "+919876543210" });
    expect(normalizeIndianPhone("91-98765-43210")).toEqual({ valid: true, phone: "+919876543210" });
    expect(normalizeIndianPhone("12345").valid).toBe(false);
    expect(normalizeIndianPhone("+91 12345 67890").valid).toBe(false);
  });
});

