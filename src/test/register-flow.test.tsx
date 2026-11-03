import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

const mockRpc = vi.fn();
const mockUpload = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: React.ComponentType }) => opts,
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string; [k: string]: unknown }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => mockUpload(...args),
      }),
    },
  },
}));

vi.mock("@/lib/registration.functions", () => ({
  createGuestRegistrationServer: vi.fn(),
  submitGuestPaymentServer: vi.fn(),
}));

import { Route as RegisterRoute } from "@/routes/register";

describe("Guest registration & payment flow (/register)", () => {
  const RegisterComponent = (RegisterRoute as unknown as { component: React.ComponentType }).component;

  beforeEach(() => {
    sessionStorage.clear();
    mockRpc.mockReset();
    mockUpload.mockReset();
  });

  it("completes the full guest registration and payment submission flow without login", async () => {
    const fakeSession = {
      id: "11111111-1111-4111-8111-111111111111",
      user_id: "22222222-2222-4222-8222-222222222222",
      booking_id: "TB-COORG-TEST99",
      full_name: "Aarav Sharma",
      email: "aarav@mesabusinessschool.org",
      phone: "+919876543210",
      cohort: "Section A",
      status: "registration_started",
      utr: null,
    };

    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === "create_registration") {
        return { data: fakeSession, error: null };
      }
      if (fnName === "submit_payment") {
        return {
          data: {
            ...fakeSession,
            status: "pending_verification",
            utr: "431298765432",
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    mockUpload.mockResolvedValue({ data: { path: "mock-path" }, error: null });

    render(<RegisterComponent />);

    // 1. Confirm registration form renders directly without login/signup
    expect(screen.queryByText(/Verify my email/i)).toBeNull();
    expect(screen.queryByText(/Password/i)).toBeNull();

    // 2. Check the 4 required fields + summary + terms checkboxes + button
    const nameInput = screen.getByPlaceholderText("Your full name");
    const emailInput = screen.getByPlaceholderText("you@mesabusinessschool.org");
    const phoneInput = screen.getByPlaceholderText("+91 98765 43210");
    const cohortSelect = screen.getByRole("combobox");

    expect(screen.getByText("COORG 2026")).toBeInTheDocument();
    expect(screen.getByText("20–22 NOVEMBER")).toBeInTheDocument();
    expect(screen.getByText("₹8,500 / PERSON")).toBeInTheDocument();

    const continueBtn = screen.getByRole("button", { name: "CONTINUE TO PAYMENT →" });
    expect(continueBtn).toBeDisabled();

    // 3. Fill in the 4 personal details
    fireEvent.change(nameInput, { target: { value: "Aarav Sharma" } });
    fireEvent.change(emailInput, { target: { value: "aarav@mesabusinessschool.org" } });
    fireEvent.change(phoneInput, { target: { value: "+91 98765 43210" } });
    fireEvent.change(cohortSelect, { target: { value: "Section A" } });

    // 4. Accept mandatory checkboxes
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);

    expect(continueBtn).not.toBeDisabled();

    // 5. Submit registration form -> move to payment step
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(screen.getByText("gatepay.nkgsbank725538@icici")).toBeInTheDocument();
    });

    expect(mockRpc).toHaveBeenCalledWith("create_registration", {
      _full_name: "Aarav Sharma",
      _email: "aarav@mesabusinessschool.org",
      _phone: "+919876543210",
      _cohort: "Section A",
      _policy_version: "2026-11-v1",
    });

    // 6. Verify payment page displays ₹8,500, UPI ID, Copy button, Pay via UPI App, and no QR code
    expect(screen.getByText("₹8,500")).toBeInTheDocument();
    expect(screen.getByText("gatepay.nkgsbank725538@icici")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy UPI ID" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pay via UPI App" })).toBeInTheDocument();
    expect(screen.queryByAltText(/qr/i)).toBeNull();

    // 7. Submit UTR and screenshot
    const utrInput = screen.getByPlaceholderText("e.g. 431298765432");
    fireEvent.change(utrInput, { target: { value: "431298765432" } });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new File(["dummy-image-bytes"], "payment.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", { value: [testFile], configurable: true });
    fireEvent.change(fileInput);

    const paymentForm = fileInput.closest("form")!;
    fireEvent.submit(paymentForm);

    // 8. Verify Pending Verification confirmation screen
    await waitFor(() => {
      expect(screen.getByText("YOU'RE ALMOST IN!")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Your payment details have been submitted and are awaiting verification."),
    ).toBeInTheDocument();
    expect(screen.getByText("Pending verification")).toBeInTheDocument();
    expect(screen.getByText("TB-COORG-TEST99")).toBeInTheDocument();
    expect(screen.getByText("431298765432")).toBeInTheDocument();
  });
});
