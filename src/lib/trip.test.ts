import { describe, it, expect } from "vitest";
import { buildUpiLink, TRIP } from "./trip";

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
