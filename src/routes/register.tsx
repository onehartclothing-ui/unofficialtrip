import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/site/PageShell";
import {
  TRIP,
  COHORT_OPTIONS,
  validateEmail,
  normalizeIndianPhone,
} from "@/lib/trip";
import {
  createGuestRegistrationServer,
  getGuestRegistrationSessionServer,
  type GuestRegistrationSession,
} from "@/lib/registration.functions";
import {
  createRazorpayOrderServer,
  verifyRazorpayPaymentServer,
} from "@/lib/razorpay.functions";

const SESSION_KEY = "titu_coorg2026_reg_v2";

function getStorages(): Storage[] {
  const list: Storage[] = [];
  try {
    if (
      typeof window !== "undefined" &&
      window.localStorage &&
      typeof window.localStorage.getItem === "function"
    ) {
      list.push(window.localStorage);
    }
  } catch {
    // Ignore storage access errors
  }
  try {
    if (
      typeof window !== "undefined" &&
      window.sessionStorage &&
      typeof window.sessionStorage.getItem === "function"
    ) {
      list.push(window.sessionStorage);
    }
  } catch {
    // Ignore storage access errors
  }
  return list;
}

function loadStoredSession(): GuestRegistrationSession | null {
  for (const storage of getStorages()) {
    try {
      const raw = storage.getItem(SESSION_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as GuestRegistrationSession;
      if (!parsed || !parsed.id || !parsed.booking_id) continue;

      const isSubmitted =
        parsed.status === "pending_verification" || parsed.status === "confirmed";
      const isNotExpired =
        parsed.session_expires_at &&
        new Date(parsed.session_expires_at).getTime() > Date.now() &&
        /^[0-9a-f]{64}$/.test(parsed.session_token ?? "");

      if (isSubmitted || isNotExpired) {
        return parsed;
      }
    } catch {
      // Ignore storage errors
    }
  }
  return null;
}

function saveStoredSession(next: GuestRegistrationSession | null) {
  for (const storage of getStorages()) {
    try {
      if (next) {
        storage.setItem(SESSION_KEY, JSON.stringify(next));
      } else {
        storage.removeItem(SESSION_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }
}

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register — Coorg 2026 | Titu Backpackers" },
      {
        name: "description",
        content:
          "Register for the Coorg 2026 student trip, 20–22 November. ₹8,500 per person via UPI.",
      },
      { property: "og:title", content: "Register — Coorg 2026" },
      {
        property: "og:description",
        content: "Register, pay ₹8,500 via UPI, and pack your bags.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegisterPage,
});

const input =
  "w-full rounded-md border border-input bg-transparent px-4 py-3.5 text-base text-bone placeholder:text-muted-foreground focus:border-ember focus:outline-none";
const primaryBtn =
  "w-full rounded-full bg-ember px-6 py-4 font-display text-xl text-ink transition-opacity disabled:opacity-40";
const errMsg = (e: unknown) =>
  e instanceof Error
    ? e.message
    : (e as { message?: string })?.message ?? "Something went wrong";

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read screenshot file"));
    reader.readAsDataURL(file);
  });
}

function RegisterPage() {
  const [reg, setReg] = useState<GuestRegistrationSession | null>(null);
  const [editingDraft, setEditingDraft] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = loadStoredSession();
    if (saved) {
      setReg(saved);
      saveStoredSession(saved);
      if (/^[0-9a-f]{64}$/.test(saved.session_token ?? "")) {
        void getGuestRegistrationSessionServer({
          data: {
            registrationId: saved.id,
            sessionToken: saved.session_token,
          },
        })
          .then((fresh) => {
            if (fresh) {
              setReg(fresh);
              saveStoredSession(fresh);
            }
          })
          .catch(() => {
            // Keep local session if offline or transient error
          });
      }
    } else {
      saveStoredSession(null);
    }
    setHydrated(true);
  }, []);

  function updateReg(next: GuestRegistrationSession | null) {
    setReg(next);
    setEditingDraft(false);
    saveStoredSession(next);
  }

  if (!hydrated) {
    return (
      <PageShell>
        <p className="eyebrow text-muted-foreground">Loading…</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {!reg || editingDraft ? (
        <DetailsStep
          initial={reg}
          onDone={updateReg}
          onResumePayment={
            reg && reg.status !== "pending_verification" && reg.status !== "confirmed"
              ? () => setEditingDraft(false)
              : undefined
          }
          onStartFresh={reg ? () => updateReg(null) : undefined}
        />
      ) : reg.status === "confirmed" ? (
        <Confirmed reg={reg} onReset={() => updateReg(null)} />
      ) : reg.status === "pending_verification" ? (
        <Submitted reg={reg} onReset={() => updateReg(null)} />
      ) : (
        <PaymentStep
          reg={reg}
          onDone={updateReg}
          onBack={() => setEditingDraft(true)}
          onStartFresh={() => updateReg(null)}
        />
      )}
    </PageShell>
  );
}

function DetailsStep({
  initial,
  onDone,
  onResumePayment,
  onStartFresh,
}: {
  initial: GuestRegistrationSession | null;
  onDone: (r: GuestRegistrationSession) => void;
  onResumePayment?: () => void;
  onStartFresh?: () => void;
}) {
  const [fullName, setFullName] = useState(initial?.full_name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [cohort, setCohort] = useState(initial?.cohort ?? "");
  const [terms, setTerms] = useState(Boolean(initial));
  const [refund, setRefund] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current || busy) return;

    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      toast.error("Please enter your full name");
      return;
    }

    const emailRes = validateEmail(email);
    if (!emailRes.valid) {
      toast.error(emailRes.error ?? "Please enter a valid email address");
      return;
    }

    const phoneRes = normalizeIndianPhone(phone);
    if (!phoneRes.valid) {
      toast.error(phoneRes.error ?? "Please enter a valid 10-digit Indian mobile number");
      return;
    }

    if (!cohort) {
      toast.error("Please select which cohort you are in");
      return;
    }

    if (!terms || !refund) {
      toast.error("Please accept the Terms & Conditions and no-refund policy");
      return;
    }

    // If the student went back from the payment page and hasn't changed any of the fields,
    // return directly to their active payment screen without creating a duplicate database request.
    const isUnchangedDraft =
      initial &&
      initial.status !== "pending_verification" &&
      initial.status !== "confirmed" &&
      initial.full_name === trimmedName &&
      (initial.email ?? null) === emailRes.email &&
      initial.phone === phoneRes.phone &&
      initial.cohort === cohort &&
      initial.session_expires_at &&
      new Date(initial.session_expires_at).getTime() > Date.now() &&
      /^[0-9a-f]{64}$/.test(initial.session_token ?? "");

    if (isUnchangedDraft && initial) {
      onDone(initial);
      return;
    }

    submittingRef.current = true;
    setBusy(true);
    try {
      const hasValidSessionToken =
        initial?.session_token && /^[0-9a-f]{64}$/.test(initial.session_token);
      const serverSession = await createGuestRegistrationServer({
        data: {
          fullName: trimmedName,
          email: emailRes.email,
          phone: phoneRes.phone,
          cohort,
          registrationId: hasValidSessionToken ? initial.id : undefined,
          sessionToken: hasValidSessionToken ? initial.session_token : undefined,
        },
      });
      onDone(serverSession);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="eyebrow text-ember">Step 1 of 2 · Registration</p>
      <h1 className="font-display mt-3 text-6xl md:text-8xl">Count me in.</h1>
      <p className="mt-3 text-bone/80">Fill in your details below to proceed to payment.</p>

      {initial && onResumePayment && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <div>
            <p className="eyebrow text-ember">Pending registration · {initial.booking_id}</p>
            <p className="mt-1 text-bone/80">
              Update your details below or return directly to the payment screen.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onResumePayment}
              className="rounded-full bg-ember px-4 py-2 font-display text-sm text-ink"
            >
              Return to payment →
            </button>
            {onStartFresh && (
              <button
                type="button"
                onClick={onStartFresh}
                className="eyebrow text-muted-foreground hover:text-bone"
              >
                Start new
              </button>
            )}
          </div>
        </div>
      )}

      <form onSubmit={submit} className="mt-8 space-y-5">
        <label className="block">
          <span className="eyebrow mb-2 block text-muted-foreground">Full Name *</span>
          <input
            className={input}
            type="text"
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
            placeholder="Enter your full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="eyebrow mb-2 block text-muted-foreground">Phone Number *</span>
          <input
            className={input}
            type="tel"
            inputMode="tel"
            required
            autoComplete="tel"
            placeholder="Enter your 10-digit mobile number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="eyebrow mb-2 block text-muted-foreground">Email Address (Optional)</span>
          <input
            className={input}
            type="email"
            maxLength={255}
            autoComplete="email"
            placeholder="Enter your email address (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="eyebrow mb-2 block text-muted-foreground">
            Which cohort are you in? *
          </span>
          <select
            className={`${input} bg-ink`}
            required
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
          >
            <option value="" disabled className="bg-ink text-muted-foreground">
              Select your cohort
            </option>
            {COHORT_OPTIONS.map((opt) => (
              <option key={opt} value={opt} className="bg-ink text-bone">
                {opt}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-xl border border-border bg-card p-5">
          <p className="font-display text-2xl text-bone">COORG 2026</p>
          <p className="eyebrow mt-1.5 text-muted-foreground">20–22 NOVEMBER</p>
          <p className="font-display mt-2 text-2xl text-ember">₹8,500 / PERSON</p>
        </div>

        <div className="space-y-3 pt-1">
          <label className="flex cursor-pointer gap-3 text-sm leading-relaxed">
            <input
              type="checkbox"
              required
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--ember)]"
            />
            <span>
              I agree to the{" "}
              <Link to="/terms" target="_blank" className="underline">
                Terms & Conditions
              </Link>{" "}
              and{" "}
              <Link to="/privacy" target="_blank" className="underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>

          <label className="flex cursor-pointer gap-3 text-sm leading-relaxed">
            <input
              type="checkbox"
              required
              checked={refund}
              onChange={(e) => setRefund(e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--ember)]"
            />
            <span>
              I understand that my ₹8,500 payment is non-refundable if I voluntarily cancel,
              subject to applicable law.
            </span>
          </label>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Your booking confirmation and trip details will be shared via your registered phone number and email address (if provided).
        </p>

        <button type="submit" disabled={busy || !terms || !refund} className={primaryBtn}>
          {busy ? "Saving…" : "CONTINUE TO PAYMENT — ₹8,500"}
        </button>
      </form>
    </div>
  );
}

function PaymentStep({
  reg,
  onDone,
  onBack,
  onStartFresh,
}: {
  reg: GuestRegistrationSession;
  onDone: (r: GuestRegistrationSession) => void;
  onBack: () => void;
  onStartFresh: () => void;
}) {
  const [razorpayLoading, setRazorpayLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleRazorpayCheckout() {
    if (razorpayLoading) return;
    setRazorpayLoading(true);
    setErrorMessage(null);

    try {
      // Ensure Razorpay Standard Checkout SDK is loaded
      const win = window as unknown as {
        Razorpay?: new (options: Record<string, unknown>) => {
          open: () => void;
          on: (event: string, handler: (response: Record<string, unknown>) => void) => void;
        };
      };

      if (!win.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load Razorpay checkout SDK"));
          document.body.appendChild(script);
        });
      }

      if (!win.Razorpay) {
        throw new Error("Razorpay SDK is not available.");
      }

      // 1. Create order on server
      const order = await createRazorpayOrderServer({
        data: {
          registrationId: reg.id,
          sessionToken: reg.session_token,
        },
      });

      // 2. Open Razorpay modal
      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        order_id: order.order_id,
        prefill: {
          name: order.prefill.name,
          email: order.prefill.email,
          contact: order.prefill.contact,
        },
        theme: {
          color: "#E86B35",
        },
        modal: {
          ondismiss: () => {
            setRazorpayLoading(false);
            toast.info("Payment window closed. You can retry whenever you are ready.");
          },
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          setRazorpayLoading(true);
          try {
            // 3. Verify signature securely on server
            const verified = await verifyRazorpayPaymentServer({
              data: {
                registrationId: reg.id,
                sessionToken: reg.session_token,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
            });

            toast.success("Payment verified successfully!");
            onDone(verified);
          } catch (err: unknown) {
            const msg = errMsg(err);
            setErrorMessage(msg);
            toast.error(msg);
          } finally {
            setRazorpayLoading(false);
          }
        },
      };

      const rzp = new win.Razorpay(options);
      rzp.on("payment.failed", (resp: Record<string, unknown>) => {
        const error = (resp?.error as { description?: string })?.description || "Payment failed";
        setErrorMessage(`Payment failed: ${error}`);
        toast.error(`Payment failed: ${error}`);
        setRazorpayLoading(false);
      });
      rzp.open();
    } catch (err: unknown) {
      const msg = errMsg(err);
      setErrorMessage(msg);
      toast.error(msg);
      setRazorpayLoading(false);
    }
  }

  return (
    <div>
      <p className="eyebrow text-ember">Step 2 of 2 · Secure Payment</p>
      
      {errorMessage && (
        <div className="mt-4 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          {errorMessage}
        </div>
      )}

      {reg.status === "rejected" && (
        <div className="mt-4 rounded-xl border border-destructive p-4 text-sm">
          Your previous booking attempt needs review
          {reg.admin_note ? `: ${reg.admin_note}` : "."} Please complete the payment below or DM @{TRIP.instagram}.
        </div>
      )}

      <h1 className="font-display mt-3 text-6xl md:text-8xl">Confirm & Pay.</h1>
      <p className="mt-3 text-lg text-bone/80">
        Complete your booking with instant verification via Razorpay.
      </p>

      <div className="mt-8 rounded-xl border border-border bg-card p-6 md:p-8">
        <div className="flex flex-col items-start justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
          <div>
            <p className="eyebrow text-muted-foreground">Booking Reference</p>
            <p className="font-mono text-2xl font-bold tracking-wider text-bone">{reg.booking_id}</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="eyebrow text-muted-foreground">Trip Amount</p>
            <p className="font-display text-4xl text-ember md:text-5xl">₹8,500</p>
          </div>
        </div>

        <div className="py-6">
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="eyebrow text-muted-foreground">Participant</p>
              <p className="mt-1 text-base text-bone">{reg.full_name}</p>
            </div>
            <div>
              <p className="eyebrow text-muted-foreground">Contact</p>
              <p className="mt-1 text-base text-bone">
                {reg.phone}
                {reg.email ? ` · ${reg.email}` : ""}
              </p>
            </div>
            <div>
              <p className="eyebrow text-muted-foreground">Cohort</p>
              <p className="mt-1 text-base text-bone">{reg.cohort || "—"}</p>
            </div>
            <div>
              <p className="eyebrow text-muted-foreground">Destination & Dates</p>
              <p className="mt-1 text-base text-bone">Coorg · 20–22 November 2026</p>
            </div>
            <div>
              <p className="eyebrow text-muted-foreground">Payment Method</p>
              <p className="mt-1 text-base text-bone">Razorpay (UPI / Cards / Netbanking)</p>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <button
            type="button"
            onClick={handleRazorpayCheckout}
            disabled={razorpayLoading}
            className={`${primaryBtn} flex items-center justify-center text-center shadow-lg transition-transform active:scale-[0.99]`}
          >
            {razorpayLoading ? "PREPARING PAYMENT…" : "PAY ₹8,500 SECURELY"}
          </button>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            🔒 256-bit encrypted checkout powered by Razorpay. Supports all UPI apps (GPay, PhonePe, Paytm), debit/credit cards, and netbanking.
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="eyebrow text-muted-foreground hover:text-bone"
        >
          ← Edit registration details
        </button>
        <button
          type="button"
          onClick={onStartFresh}
          className="eyebrow text-muted-foreground hover:text-bone"
        >
          Start a new registration →
        </button>
      </div>
    </div>
  );
}

function Submitted({
  reg,
  onReset,
}: {
  reg: GuestRegistrationSession;
  onReset: () => void;
}) {
  return (
    <div>
      <p className="eyebrow text-ember">Pending Verification</p>
      <h1 className="font-display mt-3 text-6xl md:text-8xl">YOU'RE ALMOST IN!</h1>
      <p className="mt-4 text-lg text-bone/80">
        Your payment details have been submitted and are awaiting verification.
      </p>
      <div className="mt-10 rounded-xl border border-border bg-card p-6">
        <p className="eyebrow text-muted-foreground">Status</p>
        <p className="font-display mt-2 text-3xl text-amber">Pending verification</p>
        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="eyebrow text-muted-foreground">Booking ref</dt>
            <dd className="mt-1 font-mono">{reg.booking_id}</dd>
          </div>
          <div>
            <dt className="eyebrow text-muted-foreground">UTR</dt>
            <dd className="mt-1 font-mono">{reg.utr}</dd>
          </div>
          <div>
            <dt className="eyebrow text-muted-foreground">Participant</dt>
            <dd className="mt-1">{reg.full_name}</dd>
          </div>
          {reg.cohort && (
            <div>
              <dt className="eyebrow text-muted-foreground">Cohort</dt>
              <dd className="mt-1">{reg.cohort}</dd>
            </div>
          )}
        </dl>
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        An organizer will manually verify that ₹8,500 was received before confirming your booking.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="eyebrow mt-8 text-muted-foreground hover:text-bone"
      >
        Register another participant →
      </button>
    </div>
  );
}

function downloadConfirmation(reg: GuestRegistrationSession) {
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1350;
  const g = c.getContext("2d");
  if (!g) return;
  const ink = "#0B0D0C";
  const bone = "#F4F0E8";
  const ember = "#E86B35";
  g.fillStyle = ink;
  g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = ember;
  g.fillRect(80, 80, 120, 8);
  g.fillStyle = bone;
  g.font = "500 28px 'JetBrains Mono', monospace";
  g.fillText("TITU BACKPACKERS · BOOKING CONFIRMATION", 80, 150);
  g.font = "180px Anton, Impact, sans-serif";
  g.fillText("COORG", 80, 390);
  g.fillText("2026", 80, 580);
  const rows: [string, string][] = [
    ["PARTICIPANT", reg.full_name],
    ["BOOKING ID", reg.booking_id],
    ["DATES", "20–22 November 2026"],
    ["AMOUNT", "₹8,500"],
    ["STATUS", "PAYMENT VERIFIED"],
  ];
  rows.forEach(([k, v], i) => {
    const y = 720 + i * 110;
    g.fillStyle = "#B9C0BA";
    g.font = "500 24px 'JetBrains Mono', monospace";
    g.fillText(k, 80, y);
    g.fillStyle = k === "STATUS" ? ember : bone;
    g.font = "500 44px 'Space Grotesk', sans-serif";
    g.fillText(v, 80, y + 52);
  });
  g.fillStyle = "#B9C0BA";
  g.font = "22px 'Space Grotesk', sans-serif";
  g.fillText("Unofficial student-organized trip. Not an official Mesa event.", 80, 1290);
  const a = document.createElement("a");
  a.download = `${reg.booking_id}.png`;
  a.href = c.toDataURL("image/png");
  a.click();
}

function Confirmed({
  reg,
  onReset,
}: {
  reg: GuestRegistrationSession;
  onReset: () => void;
}) {
  return (
    <div>
      <p className="eyebrow text-ember">Payment verified ✓</p>
      <h1 className="font-display mt-3 text-6xl md:text-8xl">
        You're officially going to Coorg!
      </h1>
      <div className="mt-10 rounded-xl border border-border bg-card p-6">
        <dl className="grid gap-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="eyebrow text-muted-foreground">Participant</dt>
            <dd className="mt-1 text-lg">{reg.full_name}</dd>
          </div>
          <div>
            <dt className="eyebrow text-muted-foreground">Booking ID</dt>
            <dd className="mt-1 font-mono text-lg">{reg.booking_id}</dd>
          </div>
          <div>
            <dt className="eyebrow text-muted-foreground">Trip</dt>
            <dd className="mt-1 text-lg">Coorg 2026</dd>
          </div>
          <div>
            <dt className="eyebrow text-muted-foreground">Dates</dt>
            <dd className="mt-1 text-lg">20–22 November 2026</dd>
          </div>
          <div>
            <dt className="eyebrow text-muted-foreground">Amount</dt>
            <dd className="mt-1 text-lg">₹8,500</dd>
          </div>
          <div>
            <dt className="eyebrow text-muted-foreground">Status</dt>
            <dd className="mt-1 text-lg text-ember">Payment Verified</dd>
          </div>
        </dl>
      </div>
      <button type="button" onClick={() => downloadConfirmation(reg)} className={`${primaryBtn} mt-8`}>
        Download confirmation
      </button>
      <button
        type="button"
        onClick={onReset}
        className="eyebrow mt-8 block text-muted-foreground hover:text-bone"
      >
        Register another participant →
      </button>
    </div>
  );
}
