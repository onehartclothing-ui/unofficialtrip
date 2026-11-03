import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/site/PageShell";
import { TRIP, COHORT_OPTIONS, buildUpiLink, validateEmail, normalizeIndianPhone } from "@/lib/trip";
import upiQr from "@/assets/upi-qr.jpg";
import {
  createGuestRegistrationServer,
  submitGuestPaymentServer,
  type GuestRegistrationSession,
} from "@/lib/registration.functions";

const SESSION_KEY = "titu_coorg2026_reg_v2";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register — Coorg 2026 | Titu Backpackers" },
      { name: "description", content: "Register for the Coorg 2026 student trip, 20–22 November. ₹8,500 per person via UPI." },
      { property: "og:title", content: "Register — Coorg 2026" },
      { property: "og:description", content: "Register, pay ₹8,500 via UPI, and pack your bags." },
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
const ghostBtn =
  "w-full rounded-full border border-border px-6 py-4 font-display text-lg text-bone hover:border-bone";
const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Something went wrong";

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
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as GuestRegistrationSession;
        if (parsed && parsed.id && parsed.booking_id) {
          // If the saved session is still awaiting payment, ensure its session token hasn't expired
          const isSubmitted =
            parsed.status === "pending_verification" || parsed.status === "confirmed";
          const isNotExpired =
            parsed.session_expires_at &&
            new Date(parsed.session_expires_at).getTime() > Date.now() &&
            /^[0-9a-f]{64}$/.test(parsed.session_token ?? "");
          if (isSubmitted || isNotExpired) {
            setReg(parsed);
          } else {
            sessionStorage.removeItem(SESSION_KEY);
          }
        }
      }
    } catch {
      // Ignore storage errors
    }
    setHydrated(true);
  }, []);

  function updateReg(next: GuestRegistrationSession | null) {
    setReg(next);
    setEditingDraft(false);
    try {
      if (next) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // Ignore storage errors
    }
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
        <DetailsStep initial={reg} onDone={updateReg} />
      ) : reg.status === "pending_verification" || reg.status === "confirmed" ? (
        <Submitted reg={reg} onReset={() => updateReg(null)} />
      ) : (
        <PaymentStep
          reg={reg}
          onDone={updateReg}
          onBack={() => setEditingDraft(true)}
        />
      )}
    </PageShell>
  );
}

function DetailsStep({
  initial,
  onDone,
}: {
  initial: GuestRegistrationSession | null;
  onDone: (r: GuestRegistrationSession) => void;
}) {
  const [fullName, setFullName] = useState(initial?.full_name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [cohort, setCohort] = useState(initial?.cohort ?? "");
  const [terms, setTerms] = useState(Boolean(initial));
  const [refund, setRefund] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      toast.error("Please enter your full name");
      return;
    }

    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      toast.error(emailCheck.error ?? "Please enter a valid email address");
      return;
    }

    const phoneCheck = normalizeIndianPhone(phone);
    if (!phoneCheck.valid) {
      toast.error(phoneCheck.error ?? "Please enter a valid 10-digit Indian mobile number");
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

    setBusy(true);
    try {
      const serverSession = await createGuestRegistrationServer({
        data: {
          fullName: trimmedName,
          email: emailCheck.email,
          phone: phoneCheck.phone,
          cohort,
          sessionToken:
            initial?.session_token && /^[0-9a-f]{64}$/.test(initial.session_token)
              ? initial.session_token
              : undefined,
        },
      });
      onDone(serverSession);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="eyebrow text-ember">Step 1 of 2 · Registration</p>
      <h1 className="font-display mt-3 text-6xl md:text-8xl">Count me in.</h1>
      <p className="mt-3 text-bone/80">Fill in your details below to proceed to payment.</p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <label className="block">
          <span className="eyebrow mb-2 block text-muted-foreground">Full Name</span>
          <input
            className={input}
            type="text"
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
            placeholder="Your full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="eyebrow mb-2 block text-muted-foreground">Mesa Email ID</span>
          <input
            className={input}
            type="email"
            required
            maxLength={255}
            autoComplete="email"
            placeholder="you@mesabusinessschool.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="eyebrow mb-2 block text-muted-foreground">Phone Number</span>
          <input
            className={input}
            type="tel"
            inputMode="tel"
            required
            autoComplete="tel"
            placeholder="+91 98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="eyebrow mb-2 block text-muted-foreground">Which cohort are you in?</span>
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
              I understand that my ₹8,500 payment is non-refundable if I voluntarily cancel, subject to applicable law.
            </span>
          </label>
        </div>

        <button type="submit" disabled={busy || !terms || !refund} className={primaryBtn}>
          {busy ? "Saving…" : "CONTINUE TO PAYMENT →"}
        </button>
      </form>
    </div>
  );
}

function PaymentStep({
  reg,
  onDone,
  onBack,
}: {
  reg: GuestRegistrationSession;
  onDone: (r: GuestRegistrationSession) => void;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [utr, setUtr] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(TRIP.upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setShowHelp(true);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanedUtr = utr.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z0-9]{8,30}$/.test(cleanedUtr)) {
      toast.error("Please enter a valid UPI Transaction ID / UTR (8–30 alphanumeric characters)");
      return;
    }
    if (!file) {
      toast.error("Upload your payment screenshot");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Screenshot must be an image");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Screenshot must be under 5 MB");
      return;
    }

    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const base64 = await fileToBase64(file);
      const updated = await submitGuestPaymentServer({
        data: {
          registrationId: reg.id,
          sessionToken: reg.session_token,
          utr: cleanedUtr,
          fileBase64: base64,
          fileType: file.type,
          fileExt: ext,
        },
      });
      onDone(updated);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="eyebrow text-ember">Step 2 of 2 · Payment</p>
      <h1 className="font-display mt-3 text-6xl md:text-8xl">One last thing.</h1>
      <p className="mt-3 text-lg text-bone/80">Pay ₹8,500 via UPI and submit your payment proof below.</p>

      <div className="mt-8 rounded-xl border border-border bg-card p-6 md:p-8">
        <div className="text-center">
          <p className="eyebrow text-muted-foreground">TITU BACKPACKERS — COORG 2026</p>
          <p className="font-display mt-2 text-5xl text-ember md:text-6xl">{TRIP.priceLabel} / PERSON</p>
          <p className="eyebrow mt-6 text-bone">SCAN TO PAY</p>

          <div className="mx-auto mt-4 flex h-64 w-64 items-center justify-center rounded-xl bg-white p-4 shadow-lg sm:h-72 sm:w-72">
            <img
              src={upiQr}
              alt="UPI QR code for Titu Backpackers Coorg 2026 payment"
              width={258}
              height={295}
              className="h-full w-full object-contain"
            />
          </div>

          <p className="mt-4 text-sm text-bone/80">
            Scan using any UPI app to complete your payment.
          </p>

          <a
            href={upiQr}
            download="titu-backpackers-coorg-2026-upi-qr.jpg"
            className="eyebrow mt-3 inline-block text-muted-foreground underline hover:text-bone"
          >
            Save QR image
          </a>
        </div>

        <div className="mt-8 border-t border-border pt-6">
          <a
            href={buildUpiLink(reg.booking_id)}
            onClick={() => setTimeout(() => setShowHelp(true), 1500)}
            className={`${primaryBtn} flex items-center justify-center text-center`}
          >
            PAY VIA UPI →
          </a>

          <div className="mt-5 flex flex-col items-center justify-between gap-3 rounded-lg border border-border bg-ink/50 px-4 py-3 sm:flex-row">
            <div className="text-center sm:text-left">
              <p className="eyebrow text-muted-foreground">UPI ID · Ref: {reg.booking_id}</p>
              <p className="mt-1 break-all font-mono text-sm text-bone md:text-base">{TRIP.upiId}</p>
            </div>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-full border border-border px-5 py-2 font-display text-base text-bone hover:border-bone"
            >
              {copied ? "UPI ID copied!" : "Copy UPI ID"}
            </button>
          </div>
        </div>

        {showHelp && (
          <p className="mt-4 text-sm text-muted-foreground">
            If no app opened: scan the QR code above or open GPay, PhonePe, Paytm or your bank app → Pay to UPI ID → paste{" "}
            <span className="font-mono text-bone">{TRIP.upiId}</span> → enter ₹8,500 → add{" "}
            {reg.booking_id} as the note. Opening an app does not confirm payment.
          </p>
        )}
      </div>

      <form onSubmit={submit} className="mt-10 space-y-5">
        <p className="eyebrow">After paying, submit your payment proof</p>
        <label className="block">
          <span className="eyebrow mb-2 block text-muted-foreground">UPI Transaction ID / UTR</span>
          <input
            className={input}
            required
            value={utr}
            onChange={(e) => setUtr(e.target.value.replace(/\s/g, ""))}
            pattern="[A-Za-z0-9]{8,30}"
            maxLength={30}
            placeholder="e.g. 431298765432"
          />
        </label>
        <label className="block">
          <span className="eyebrow mb-2 block text-muted-foreground">Payment screenshot</span>
          <input
            type="file"
            accept="image/*"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-full file:border-0 file:bg-pine file:px-4 file:py-2.5 file:text-bone"
          />
        </label>
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? "Uploading…" : "I'VE PAID ₹8,500 →"}
        </button>
      </form>

      <button
        type="button"
        onClick={onBack}
        className="eyebrow mt-8 text-muted-foreground hover:text-bone"
      >
        ← Edit registration details
      </button>
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
