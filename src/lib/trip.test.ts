import { describe, it, expect } from "vitest";
import {
  buildUpiLink,
  buildIosUpiAppLinks,
  detectDevicePlatform,
  getAuthRedirectUrl,
  TRIP,
  COHORT_OPTIONS,
  validateEmail,
  normalizeIndianPhone,
} from "./trip";

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
  it("includes 'Titu Backpackers Coorg Trip' and booking reference with proper percent-encoding and no payee name", () => {
    const raw = buildUpiLink("TB-COORG-ABC123");
    expect(raw).toContain("tn=Titu%20Backpackers%20Coorg%20Trip%20TB-COORG-ABC123");
    expect(raw.toLowerCase()).not.toContain("whatsapp");
    const u = new URL(raw.replace("upi://", "https://x/"));
    expect(u.searchParams.get("tn")).toContain("Titu Backpackers Coorg Trip");
    expect(u.searchParams.get("tn")).toContain("TB-COORG-ABC123");
    expect(u.searchParams.get("pn")).toBeNull();
  });
  it("builds valid iOS app-specific UPI deep links (Google Pay, PhonePe, Paytm, BHIM) and never uses WhatsApp or generic upi://", () => {
    const ios = buildIosUpiAppLinks("TB-COORG-ABC123");
    expect(ios.gpay.startsWith("tez://upi/pay?")).toBe(true);
    expect(ios.phonepe.startsWith("phonepe://pay?")).toBe(true);
    expect(ios.paytm.startsWith("paytmmp://pay?")).toBe(true);
    expect(ios.bhim.startsWith("bhim://pay?")).toBe(true);
    for (const link of Object.values(ios)) {
      expect(link).toContain("pa=gatepay.nkgsbank725538%40icici");
      expect(link).toContain("am=8500");
      expect(link).toContain("cu=INR");
      expect(link).toContain("tn=Titu%20Backpackers%20Coorg%20Trip");
      expect(link.toLowerCase()).not.toContain("whatsapp");
      expect(link.startsWith("upi://")).toBe(false);
    }
  });
  it("detects iOS, Android, and Desktop platforms accurately", () => {
    expect(
      detectDevicePlatform(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
        5,
      ),
    ).toBe("ios");
    expect(
      detectDevicePlatform(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36",
        5,
      ),
    ).toBe("android");
    expect(
      detectDevicePlatform(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        0,
      ),
    ).toBe("desktop");
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

  it("exposes the canonical production site URL and builds safe auth callback URLs", () => {
    expect(TRIP.productionSiteUrl).toBe("https://unofficialtrip-phi.vercel.app");
    const callbackUrl = getAuthRedirectUrl("/auth/callback");
    expect(callbackUrl).toContain("/auth/callback");
  });
});

