import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { PageShell } from "@/components/site/PageShell";
import { TRIP, buildUpiLink, STATUS_LABEL } from "@/lib/trip";

type Reg = Tables<"registrations">;

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register — Coorg 2026 | Titu Backpackers" },
      { name: "description", content: "Register for the Coorg 2026 student trip, 20–22 November. ₹8,500 per person via UPI." },
      { property: "og:title", content: "Register — Coorg 2026" },
      { property: "og:description", content: "Verify your email, pay ₹8,500 via UPI, pack your bags." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegisterPage,
});

const input = "w-full rounded-md border border-input bg-transparent px-4 py-3.5 text-base text-bone placeholder:text-muted-foreground focus:border-ember focus:outline-none";
const primaryBtn = "w-full rounded-full bg-ember px-6 py-4 font-display text-xl text-ink transition-opacity disabled:opacity-40";
const ghostBtn = "w-full rounded-full border border-border px-6 py-4 font-display text-lg text-bone hover:border-bone";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Something went wrong");

function RegisterPage() {
  const { user, loading } = useAuth();
  const [reg, setReg] = useState<Reg | null | undefined>(undefined);

  const load = useCallback(async () => {
    if (!user) { setReg(null); return; }
    const { data } = await supabase.from("registrations").select("*").eq("user_id", user.id).maybeSingle();
    setReg(data);
  }, [user]);
  useEffect(() => { if (!loading) load(); }, [loading, load]);

  let body;
  if (loading || (user && reg === undefined)) body = <p className="eyebrow text-muted-foreground">Loading…</p>;
  else if (!user) body = <AuthStep />;
  else if (!reg) body = <DetailsStep onDone={setReg} />;
  else if (reg.status === "pending_verification") body = <Submitted reg={reg} />;
  else if (reg.status === "confirmed") body = <Confirmed reg={reg} />;
  else body = <PaymentStep reg={reg} onDone={setReg} />;

  return (
    <PageShell>
      {body}
      {user && (
        <button onClick={() => supabase.auth.signOut()} className="eyebrow mt-12 text-muted-foreground hover:text-bone">
          Sign out ({user.email})
        </button>
      )}
    </PageShell>
  );
}

function AuthStep() {
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/register` },
        });
        if (error) throw error;
        setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (error) throw error;
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <div>
        <p className="eyebrow text-ember">Step 1 of 3</p>
        <h1 className="font-display mt-3 text-6xl md:text-7xl">Check your inbox.</h1>
        <p className="mt-6 text-bone/80">We sent a verification link to <strong>{email}</strong>. Open it on this device to continue. Can't find it? Check spam.</p>
        <button onClick={() => { setSent(false); setMode("signin"); }} className={`${ghostBtn} mt-10`}>Already verified? Sign in</button>
      </div>
    );

  return (
    <div>
      <p className="eyebrow text-ember">Step 1 of 3</p>
      <h1 className="font-display mt-3 text-6xl md:text-8xl">{mode === "signup" ? "Count me in." : "Welcome back."}</h1>
      <p className="mt-4 text-bone/80">Use your Mesa email. We verify it before you can pay.</p>
      <form onSubmit={submit} className="mt-10 space-y-4">
        <label className="block"><span className="eyebrow mb-2 block text-muted-foreground">Mesa email address</span>
          <input className={input} type="email" required autoComplete="email" maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@mesa..." />
        </label>
        <label className="block"><span className="eyebrow mb-2 block text-muted-foreground">Password</span>
          <input className={input} type="password" required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button disabled={busy} className={primaryBtn}>{busy ? "…" : mode === "signup" ? "Verify my email →" : "Sign in →"}</button>
      </form>
      <button onClick={() => setMode(mode === "signup" ? "signin" : "signup")} className="eyebrow mt-6 text-muted-foreground hover:text-bone">
        {mode === "signup" ? "Already registered? Sign in" : "New here? Create account"}
      </button>
    </div>
  );
}

function DetailsStep({ onDone }: { onDone: (r: Reg) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("create_registration", { _full_name: name, _phone: phone.replace(/[\s-]/g, "") });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onDone(data as Reg);
  }
  return (
    <div>
      <p className="eyebrow text-ember">Step 2 of 3 · Email verified ✓</p>
      <h1 className="font-display mt-3 text-6xl md:text-7xl">Who's coming?</h1>
      <form onSubmit={submit} className="mt-10 space-y-4">
        <label className="block"><span className="eyebrow mb-2 block text-muted-foreground">Full name</span>
          <input className={input} required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block"><span className="eyebrow mb-2 block text-muted-foreground">Phone number</span>
          <input className={input} required type="tel" inputMode="tel" autoComplete="tel" pattern="\+?[0-9\s\-]{10,16}" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
        </label>
        <button disabled={busy} className={primaryBtn}>{busy ? "…" : "Continue to payment →"}</button>
      </form>
    </div>
  );
}

function PaymentStep({ reg, onDone }: { reg: Reg; onDone: (r: Reg) => void }) {
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [terms, setTerms] = useState(false);
  const [refund, setRefund] = useState(false);
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
    if (!file) { toast.error("Upload your payment screenshot"); return; }
    if (!file.type.startsWith("image/")) { toast.error("Screenshot must be an image"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Screenshot must be under 5 MB"); return; }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${reg.user_id}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from("payment-screenshots").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      const { data, error } = await supabase.rpc("submit_payment", { _utr: utr.trim(), _screenshot_path: path, _policy_version: TRIP.policyVersion });
      if (error) throw error;
      onDone(data as Reg);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="eyebrow text-ember">Step 3 of 3 · {STATUS_LABEL[reg.status]}</p>
      {reg.status === "rejected" && (
        <div className="mt-4 rounded-md border border-destructive p-4 text-sm">
          Your last payment submission needs review{reg.admin_note ? `: ${reg.admin_note}` : "."} Please resubmit or DM @{TRIP.instagram}.
        </div>
      )}
      <h1 className="font-display mt-3 text-6xl md:text-8xl">One last thing.</h1>
      <p className="mt-3 text-lg text-bone/80">Pay. Confirm. Pack your bags.</p>

      <div className="mt-10 rounded-xl border border-border bg-card p-6 md:p-8">
        <p className="eyebrow text-muted-foreground">Total amount</p>
        <p className="font-display mt-2 text-6xl">{TRIP.priceLabel}</p>
        <p className="eyebrow mt-8 text-muted-foreground">Pay to this UPI ID</p>
        <p className="mt-2 break-all font-mono text-lg md:text-xl">{TRIP.upiId}</p>
        <p className="mt-2 text-xs text-muted-foreground">Reference: {reg.booking_id}</p>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <button type="button" onClick={copy} className={copied ? `${primaryBtn} bg-bone` : primaryBtn}>{copied ? "UPI ID copied!" : "Copy UPI ID"}</button>
          <a href={buildUpiLink(reg.booking_id)} onClick={() => setTimeout(() => setShowHelp(true), 1500)} className={`${ghostBtn} text-center md:hidden`}>Pay via UPI app</a>
        </div>
        {showHelp && (
          <p className="mt-4 text-sm text-muted-foreground">
            If no app opened: open GPay, PhonePe, Paytm or your bank app → Pay to UPI ID → paste <span className="font-mono text-bone">{TRIP.upiId}</span> → enter ₹8,500 → add {reg.booking_id} as the note. Opening an app does not confirm payment.
          </p>
        )}
      </div>

      <form onSubmit={submit} className="mt-10 space-y-5">
        <p className="eyebrow">After paying, come back here</p>
        <label className="block"><span className="eyebrow mb-2 block text-muted-foreground">UPI Transaction ID / UTR number</span>
          <input className={input} required value={utr} onChange={(e) => setUtr(e.target.value.replace(/\s/g, ""))} pattern="[A-Za-z0-9]{8,30}" maxLength={30} placeholder="e.g. 431298765432" />
        </label>
        <label className="block"><span className="eyebrow mb-2 block text-muted-foreground">Payment screenshot</span>
          <input type="file" accept="image/*" required onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-full file:border-0 file:bg-pine file:px-4 file:py-2.5 file:text-bone" />
        </label>
        <label className="flex gap-3 text-sm leading-relaxed">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--ember)]" />
          <span>I agree to the <Link to="/terms" target="_blank" className="underline">Terms & Conditions</Link> and <Link to="/privacy" target="_blank" className="underline">Privacy Policy</Link>.</span>
        </label>
        <label className="flex gap-3 text-sm leading-relaxed">
          <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--ember)]" />
          <span>I understand that my ₹8,500 payment is non-refundable if I voluntarily cancel, subject to applicable law.</span>
        </label>
        <button disabled={busy || !terms || !refund} className={primaryBtn}>{busy ? "Uploading…" : "I've paid ₹8,500"}</button>
      </form>
    </div>
  );
}

function Submitted({ reg }: { reg: Reg }) {
  return (
    <div>
      <h1 className="font-display text-6xl md:text-8xl">Payment submitted!</h1>
      <p className="mt-4 text-lg text-bone/80">Your payment is awaiting verification.</p>
      <div className="mt-10 rounded-xl border border-border bg-card p-6">
        <p className="eyebrow text-muted-foreground">Status</p>
        <p className="font-display mt-2 text-3xl text-amber">Pending verification</p>
        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div><dt className="eyebrow text-muted-foreground">Booking ref</dt><dd className="mt-1 font-mono">{reg.booking_id}</dd></div>
          <div><dt className="eyebrow text-muted-foreground">UTR</dt><dd className="mt-1 font-mono">{reg.utr}</dd></div>
        </dl>
      </div>
      <p className="mt-6 text-sm text-muted-foreground">An organizer will manually check that ₹8,500 was received. Come back to this page anytime to see your status.</p>
    </div>
  );
}

function downloadConfirmation(reg: Reg) {
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1350;
  const g = c.getContext("2d")!;
  const css = getComputedStyle(document.documentElement);
  const ink = "#0B0D0C", bone = "#F4F0E8", ember = "#E86B35";
  void css;
  g.fillStyle = ink; g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = ember; g.fillRect(80, 80, 120, 8);
  g.fillStyle = bone;
  g.font = "500 28px 'JetBrains Mono', monospace"; g.fillText("TITU BACKPACKERS · BOOKING CONFIRMATION", 80, 150);
  g.font = "180px Anton, Impact, sans-serif"; g.fillText("COORG", 80, 390); g.fillText("2026", 80, 580);
  const rows: [string, string][] = [
    ["PARTICIPANT", reg.full_name], ["BOOKING ID", reg.booking_id], ["DATES", "20–22 November 2026"],
    ["AMOUNT", "₹8,500"], ["STATUS", "PAYMENT VERIFIED"],
  ];
  rows.forEach(([k, v], i) => {
    const y = 720 + i * 110;
    g.fillStyle = "#B9C0BA"; g.font = "500 24px 'JetBrains Mono', monospace"; g.fillText(k, 80, y);
    g.fillStyle = k === "STATUS" ? ember : bone; g.font = "500 44px 'Space Grotesk', sans-serif"; g.fillText(v, 80, y + 52);
  });
  g.fillStyle = "#B9C0BA"; g.font = "22px 'Space Grotesk', sans-serif";
  g.fillText("Unofficial student-organized trip. Not an official Mesa event.", 80, 1290);
  const a = document.createElement("a");
  a.download = `${reg.booking_id}.png`; a.href = c.toDataURL("image/png"); a.click();
}

function Confirmed({ reg }: { reg: Reg }) {
  return (
    <div>
      <p className="eyebrow text-ember">Payment verified ✓</p>
      <h1 className="font-display mt-3 text-6xl md:text-8xl">You're officially going to Coorg!</h1>
      <div className="mt-10 rounded-xl border border-border bg-card p-6">
        <dl className="grid gap-5 text-sm sm:grid-cols-2">
          <div><dt className="eyebrow text-muted-foreground">Participant</dt><dd className="mt-1 text-lg">{reg.full_name}</dd></div>
          <div><dt className="eyebrow text-muted-foreground">Booking ID</dt><dd className="mt-1 font-mono text-lg">{reg.booking_id}</dd></div>
          <div><dt className="eyebrow text-muted-foreground">Trip</dt><dd className="mt-1 text-lg">Coorg 2026</dd></div>
          <div><dt className="eyebrow text-muted-foreground">Dates</dt><dd className="mt-1 text-lg">20–22 November 2026</dd></div>
          <div><dt className="eyebrow text-muted-foreground">Amount</dt><dd className="mt-1 text-lg">₹8,500</dd></div>
          <div><dt className="eyebrow text-muted-foreground">Status</dt><dd className="mt-1 text-lg text-ember">Payment Verified</dd></div>
        </dl>
      </div>
      <button onClick={() => downloadConfirmation(reg)} className={`${primaryBtn} mt-8`}>Download confirmation</button>
    </div>
  );
}
