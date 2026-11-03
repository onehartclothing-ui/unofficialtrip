import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/site/PageShell";
import {
  TRIP,
  COHORT_OPTIONS,
  buildUpiLink,
  buildIosUpiAppLinks,
  detectDevicePlatform,
  validateEmail,
  normalizeIndianPhone,
} from "@/lib/trip";
import upiQr from "@/assets/upi-qr.jpg";
import {
  createGuestRegistrationServer,
  getGuestRegistrationSessionServer,
  checkRegistrationEmailExistsServer,
  resumeRegistrationByVerifiedEmailServer,
  submitGuestPaymentServer,
  type GuestRegistrationSession,
} from "@/lib/registration.functions";

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
const errMsg = (e: unknown) => {
  const raw =
    e instanceof Error
      ? e.message
      : (e as { message?: string })?.message ?? "Something went wrong";
  return raw.replace(/^REGISTRATION_EXISTS:\s*/i, "");
};

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

  // Automatically resume booking if a student clicked a magic link from their email
  useEffect(() => {
    if (!hydrated || reg) return;
    let active = true;
    try {
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        if (
          (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
          session?.access_token
        ) {
          void resumeRegistrationByVerifiedEmailServer({
            data: { accessToken: session.access_token },
          })
            .then((resumed) => {
              if (!active) return;
              setReg(resumed);
              setEditingDraft(false);
              saveStoredSession(resumed);
            })
            .catch(() => {
              // Ignore if the signed-in user has no guest registration (e.g. admin session)
            });
        }
      });
      return () => {
        active = false;
        sub.subscription.unsubscribe();
      };
    } catch {
      return () => {
        active = false;
      };
    }
  }, [hydrated, reg]);

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
  const [mode, setMode] = useState<"new" | "returning">("new");
  const [fullName, setFullName] = useState(initial?.full_name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [cohort, setCohort] = useState(initial?.cohort ?? "");
  const [terms, setTerms] = useState(Boolean(initial));
  const [refund, setRefund] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);
  const [conflictEmailPrompt, setConflictEmailPrompt] = useState<string | null>(null);
  const submittingRef = useRef(false);

  // Returning student verification state
  const [returningEmail, setReturningEmail] = useState(initial?.email ?? "");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [returningBusy, setReturningBusy] = useState(false);
  const returningRef = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current || busy) return;

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

    // If the student already has an active, unexpired registration session and hasn't changed any of the 4 fields,
    // reuse the existing pending registration immediately without creating a duplicate database request.
    const isUnchangedDraft =
      initial &&
      initial.status !== "pending_verification" &&
      initial.status !== "confirmed" &&
      initial.full_name === trimmedName &&
      initial.email === emailCheck.email &&
      initial.phone === phoneCheck.phone &&
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
    setConflictEmailPrompt(null);
    try {
      const hasValidSessionToken =
        initial?.session_token && /^[0-9a-f]{64}$/.test(initial.session_token);
      const serverSession = await createGuestRegistrationServer({
        data: {
          fullName: trimmedName,
          email: emailCheck.email,
          phone: phoneCheck.phone,
          cohort,
          registrationId: hasValidSessionToken ? initial.id : undefined,
          sessionToken: hasValidSessionToken ? initial.session_token : undefined,
        },
      });
      onDone(serverSession);
    } catch (err) {
      const raw =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message ?? "Something went wrong";
      if (
        raw.includes("REGISTRATION_EXISTS") ||
        /already exists|already registered|already been submitted/i.test(raw)
      ) {
        setReturningEmail(emailCheck.email);
        setConflictEmailPrompt(emailCheck.email);
      }
      toast.error(errMsg(err));
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  async function requestReturningVerification(e: React.FormEvent) {
    e.preventDefault();
    if (returningRef.current || returningBusy) return;

    const emailCheck = validateEmail(returningEmail);
    if (!emailCheck.valid) {
      toast.error(emailCheck.error ?? "Please enter a valid email address");
      return;
    }

    // Fast path: if this browser already holds an active, valid session for this exact email, verify & resume immediately
    if (
      initial &&
      initial.email === emailCheck.email &&
      /^[0-9a-f]{64}$/.test(initial.session_token ?? "")
    ) {
      returningRef.current = true;
      setReturningBusy(true);
      try {
        const refreshed = await getGuestRegistrationSessionServer({
          data: {
            registrationId: initial.id,
            sessionToken: initial.session_token,
          },
        });
        if (refreshed) {
          onDone(refreshed);
          return;
        }
      } catch {
        // Fall through to email OTP verification if session expired
      } finally {
        returningRef.current = false;
        setReturningBusy(false);
      }
    }

    returningRef.current = true;
    setReturningBusy(true);
    try {
      const { exists } = await checkRegistrationEmailExistsServer({
        data: { email: emailCheck.email },
      });
      if (!exists) {
        toast.error(
          "No existing registration found for this email. Please select 'New Student — Register' to register.",
        );
        return;
      }

      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/register` : undefined;
      const { error } = await supabase.auth.signInWithOtp({
        email: emailCheck.email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: redirectTo,
        },
      });
      if (error) throw error;

      setOtpSent(true);
      toast.success("Verification email sent! Enter the code or click the link in your inbox.");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      returningRef.current = false;
      setReturningBusy(false);
    }
  }

  async function verifyReturningOtp(e: React.FormEvent) {
    e.preventDefault();
    if (returningRef.current || returningBusy) return;

    const emailCheck = validateEmail(returningEmail);
    if (!emailCheck.valid) {
      toast.error(emailCheck.error ?? "Please enter a valid email address");
      return;
    }

    const token = otpCode.trim();
    if (token.length < 6) {
      toast.error("Please enter the verification code from your email");
      return;
    }

    returningRef.current = true;
    setReturningBusy(true);
    try {
      const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
        email: emailCheck.email,
        token,
        type: "email",
      });

      if (verifyErr || !verifyData?.session?.access_token) {
        throw new Error(
          verifyErr?.message ?? "Invalid or expired verification code. Please try again.",
        );
      }

      const resumed = await resumeRegistrationByVerifiedEmailServer({
        data: { accessToken: verifyData.session.access_token },
      });

      onDone(resumed);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      returningRef.current = false;
      setReturningBusy(false);
    }
  }

  return (
    <div>
      <p className="eyebrow text-ember">Step 1 of 2 · Registration</p>
      <h1 className="font-display mt-3 text-6xl md:text-8xl">Count me in.</h1>
      <p className="mt-3 text-bone/80">
        Register as a new student or continue an existing booking where you left off.
      </p>

      {/* Mode Selector: New Student vs Returning Student */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setMode("new");
            setConflictEmailPrompt(null);
          }}
          className={`rounded-xl border px-4 py-3.5 text-left transition-colors ${
            mode === "new"
              ? "border-ember bg-ember/10 text-bone"
              : "border-border bg-card text-muted-foreground hover:border-bone hover:text-bone"
          }`}
        >
          <span className="font-display block text-lg text-bone">
            New Student — Register
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            First time registering for Coorg 2026
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode("returning");
            if (email && !returningEmail) setReturningEmail(email);
          }}
          className={`rounded-xl border px-4 py-3.5 text-left transition-colors ${
            mode === "returning"
              ? "border-ember bg-ember/10 text-bone"
              : "border-border bg-card text-muted-foreground hover:border-bone hover:text-bone"
          }`}
        >
          <span className="font-display block text-lg text-bone">
            Already Registered? Continue Your Booking
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Resume pending payment or check verification status
          </span>
        </button>
      </div>

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

      {conflictEmailPrompt && mode === "new" && (
        <div className="mt-6 rounded-xl border border-ember bg-card p-5 text-sm">
          <p className="eyebrow text-ember">Existing registration found</p>
          <p className="mt-2 text-bone/90">
            We found an existing booking for{" "}
            <span className="font-mono text-bone">{conflictEmailPrompt}</span>. You do not need to
            register again—verify your email to continue directly to your booking and payment page.
          </p>
          <button
            type="button"
            onClick={() => {
              setReturningEmail(conflictEmailPrompt);
              setMode("returning");
              setConflictEmailPrompt(null);
            }}
            className="mt-4 rounded-full bg-ember px-5 py-2.5 font-display text-base text-ink"
          >
            Continue Your Booking →
          </button>
        </div>
      )}

      {mode === "returning" ? (
        <div className="mt-8 rounded-xl border border-border bg-card p-6 md:p-8">
          <p className="eyebrow text-ember">Returning Student · Secure Booking Recovery</p>
          <h2 className="font-display mt-2 text-3xl text-bone md:text-4xl">
            Continue Your Booking
          </h2>
          <p className="mt-2 text-sm text-bone/80">
            Enter the email address you registered with. We will send a one-time verification code
            and sign-in link to confirm your identity and restore your booking.
          </p>

          {!otpSent ? (
            <form onSubmit={requestReturningVerification} className="mt-6 space-y-5">
              <label className="block">
                <span className="eyebrow mb-2 block text-muted-foreground">
                  Registered Email ID
                </span>
                <input
                  className={input}
                  type="email"
                  required
                  maxLength={255}
                  autoComplete="email"
                  placeholder="you@mesabusinessschool.org"
                  value={returningEmail}
                  onChange={(e) => setReturningEmail(e.target.value)}
                />
              </label>

              <button type="submit" disabled={returningBusy} className={primaryBtn}>
                {returningBusy ? "Sending verification…" : "SEND VERIFICATION CODE →"}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyReturningOtp} className="mt-6 space-y-5">
              <div className="rounded-lg border border-border bg-ink/60 p-4 text-sm text-bone/90">
                Verification code sent to{" "}
                <span className="font-mono text-bone">{returningEmail}</span>. Enter the code from
                your email below (or click the magic link in the email on this device).
              </div>

              <label className="block">
                <span className="eyebrow mb-2 block text-muted-foreground">
                  Email Verification Code (OTP)
                </span>
                <input
                  className={`${input} font-mono tracking-widest`}
                  type="text"
                  inputMode="numeric"
                  required
                  maxLength={10}
                  placeholder="Enter 6-digit code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\s+/g, ""))}
                />
              </label>

              <button type="submit" disabled={returningBusy} className={primaryBtn}>
                {returningBusy ? "Verifying & restoring…" : "VERIFY & CONTINUE BOOKING →"}
              </button>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtpCode("");
                  }}
                  className="eyebrow text-muted-foreground hover:text-bone"
                >
                  ← Use a different email
                </button>
                <button
                  type="button"
                  disabled={returningBusy}
                  onClick={(e) => void requestReturningVerification(e)}
                  className="eyebrow text-muted-foreground hover:text-bone"
                >
                  Resend verification email
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
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
            <span className="eyebrow mb-2 block text-muted-foreground">
              Which cohort are you in?
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

          <button type="submit" disabled={busy || !terms || !refund} className={primaryBtn}>
            {busy ? "Saving…" : "CONTINUE TO PAYMENT →"}
          </button>
        </form>
      )}
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
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showIosApps, setShowIosApps] = useState(false);
  const [utr, setUtr] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);

  const iosLinks = buildIosUpiAppLinks(reg.booking_id);

  async function copy() {
    try {
      await navigator.clipboard.writeText(TRIP.upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setShowHelp(true);
    }
  }

  function handlePayViaUpi() {
    const platform = detectDevicePlatform();
    if (platform === "android") {
      // On Android, standard upi://pay opens the system chooser for Google Pay, PhonePe, Paytm, BHIM, or banking apps
      window.location.href = buildUpiLink(reg.booking_id);
      setTimeout(() => setShowHelp(true), 1500);
      return;
    }
    if (platform === "ios") {
      // On iPhone/iPad, generic upi:// is claimed by WhatsApp in iOS Safari.
      // Show explicit app-specific UPI deep links (Google Pay, PhonePe, Paytm, BHIM) and fallback instructions instead.
      setShowIosApps(true);
      setShowHelp(true);
      return;
    }
    // On desktop browsers, direct UPI URI launching is unsupported; show instructions to scan the QR or copy UPI ID
    void copy();
    setShowHelp(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current || busy) return;

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

    submittingRef.current = true;
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
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="eyebrow text-ember">Step 2 of 2 · Payment</p>
      {reg.status === "rejected" && (
        <div className="mt-4 rounded-md border border-destructive p-4 text-sm">
          Your previous payment submission needs review
          {reg.admin_note ? `: ${reg.admin_note}` : "."} Please submit a valid UTR and payment
          screenshot below or DM @{TRIP.instagram}.
        </div>
      )}
      <h1 className="font-display mt-3 text-6xl md:text-8xl">One last thing.</h1>
      <p className="mt-3 text-lg text-bone/80">
        Pay ₹8,500 via UPI and submit your payment proof below.
      </p>

      <div className="mt-8 rounded-xl border border-border bg-card p-6 md:p-8">
        <div className="text-center">
          <p className="eyebrow text-muted-foreground">TITU BACKPACKERS — COORG 2026</p>
          <p className="font-display mt-2 text-5xl text-ember md:text-6xl">
            {TRIP.priceLabel} / PERSON
          </p>
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
          <button
            type="button"
            onClick={handlePayViaUpi}
            className={`${primaryBtn} flex items-center justify-center text-center`}
          >
            PAY VIA UPI →
          </button>

          {showIosApps && (
            <div className="mt-4 rounded-lg border border-border bg-ink/70 p-4">
              <p className="eyebrow text-bone">Choose your UPI app (iPhone)</p>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <a
                  href={iosLinks.gpay}
                  className="rounded-full border border-border px-4 py-2.5 text-center font-display text-sm text-bone hover:border-ember"
                >
                  Google Pay →
                </a>
                <a
                  href={iosLinks.phonepe}
                  className="rounded-full border border-border px-4 py-2.5 text-center font-display text-sm text-bone hover:border-ember"
                >
                  PhonePe →
                </a>
                <a
                  href={iosLinks.paytm}
                  className="rounded-full border border-border px-4 py-2.5 text-center font-display text-sm text-bone hover:border-ember"
                >
                  Paytm →
                </a>
                <a
                  href={iosLinks.bhim}
                  className="rounded-full border border-border px-4 py-2.5 text-center font-display text-sm text-bone hover:border-ember"
                >
                  BHIM →
                </a>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Or tap &ldquo;Save QR image&rdquo; above and use &ldquo;Scan from Gallery&rdquo; in
                any UPI app, or copy the UPI ID below.
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-col items-center justify-between gap-3 rounded-lg border border-border bg-ink/50 px-4 py-3 sm:flex-row">
            <div className="text-center sm:text-left">
              <p className="eyebrow text-muted-foreground">UPI ID · Ref: {reg.booking_id}</p>
              <p className="mt-1 break-all font-mono text-sm text-bone md:text-base">
                {TRIP.upiId}
              </p>
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
            To pay manually: scan the QR code above (or save it and scan from your gallery), or open
            Google Pay, PhonePe, Paytm, or your banking app → Pay to UPI ID → paste{" "}
            <span className="font-mono text-bone">{TRIP.upiId}</span> → enter ₹8,500 → description{" "}
            <span className="font-mono text-bone">Titu Backpackers Coorg Trip</span>. Opening an app
            does not confirm payment.
          </p>
        )}
      </div>

      <form onSubmit={submit} className="mt-10 space-y-5">
        <p className="eyebrow">After paying, submit your payment proof</p>
        <label className="block">
          <span className="eyebrow mb-2 block text-muted-foreground">
            UPI Transaction ID / UTR
          </span>
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
            <dd className="mt-1 text-lg">20–22 November 2026</dd></div>
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
