import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { STATUS_LABEL } from "@/lib/trip";

type Reg = Tables<"registrations">;

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Organizer dashboard — Coorg 2026" },
      { name: "description", content: "Organizer-only dashboard for verifying Coorg 2026 registrations." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Organizer dashboard — Coorg 2026" },
      { property: "og:description", content: "Organizer-only." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

const FILTERS = ["all", "pending_verification", "confirmed", "rejected", "email_verified"] as const;

function AdminPage() {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Reg[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending_verification");

  useEffect(() => {
    if (!user) { setIsAdmin(null); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("registrations").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows(data ?? []);
  }, []);
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  const shown = useMemo(() => (filter === "all" ? rows : rows.filter((r) => r.status === filter)), [rows, filter]);

  async function setStatus(r: Reg, status: "confirmed" | "rejected") {
    const note = status === "rejected" ? window.prompt("Reason (shown to the student):") ?? "" : null;
    const { error } = await supabase.from("registrations").update({
      status, admin_note: note, reviewed_at: new Date().toISOString(), reviewed_by: user!.id, updated_at: new Date().toISOString(),
    }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "confirmed" ? `${r.full_name} confirmed` : "Marked for review");
    load();
  }

  async function viewShot(path: string) {
    const { data, error } = await supabase.storage.from("payment-screenshots").createSignedUrl(path, 120);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  function exportCsv() {
    const cols = ["booking_id", "full_name", "email", "phone", "status", "utr", "payment_submitted_at", "terms_accepted_at", "policy_version", "reviewed_at"] as const;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...shown.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `coorg-2026-${filter}.csv`; a.click();
  }

  if (loading) return <Wrap><p className="eyebrow">Loading…</p></Wrap>;
  if (!user) return <Wrap><p>Sign in first on the <Link to="/register" className="underline">register page</Link>, then come back.</p></Wrap>;
  if (isAdmin === null) return <Wrap><p className="eyebrow">Checking access…</p></Wrap>;
  if (!isAdmin) return <Wrap><p>This area is for organizers only.</p></Wrap>;

  const count = (s: string) => rows.filter((r) => r.status === s).length;

  return (
    <Wrap>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-5xl md:text-7xl">Organizers.</h1>
        <button onClick={exportCsv} className="rounded-full border border-border px-5 py-2.5 eyebrow hover:border-bone">Export CSV</button>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-3">
        {([["Pending", "pending_verification"], ["Confirmed", "confirmed"], ["Review", "rejected"]] as const).map(([l, s]) => (
          <div key={s} className="rounded-lg border border-border bg-card p-4"><p className="eyebrow text-muted-foreground">{l}</p><p className="font-display mt-1 text-4xl">{count(s)}</p></div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-4 py-2 eyebrow ${filter === f ? "bg-bone text-ink" : "border border-border"}`}>
            {f === "all" ? "All" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {shown.length === 0 && <p className="text-muted-foreground">Nothing here.</p>}
        {shown.map((r) => (
          <div key={r.id} className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-medium">{r.full_name}</p>
                <p className="text-sm text-muted-foreground">{r.email} · {r.phone}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{r.booking_id}</p>
              </div>
              <span className="eyebrow rounded-full border border-border px-3 py-1">{STATUS_LABEL[r.status] ?? r.status}</span>
            </div>
            {r.utr && (
              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                <span>UTR: <span className="font-mono">{r.utr}</span></span>
                {r.screenshot_path && <button onClick={() => viewShot(r.screenshot_path!)} className="underline">View screenshot</button>}
                {r.payment_submitted_at && <span className="text-muted-foreground">{new Date(r.payment_submitted_at).toLocaleString("en-IN")}</span>}
              </div>
            )}
            {r.admin_note && <p className="mt-2 text-sm text-muted-foreground">Note: {r.admin_note}</p>}
            {r.status === "pending_verification" && (
              <div className="mt-4 flex gap-3">
                <button onClick={() => setStatus(r, "confirmed")} className="rounded-full bg-ember px-5 py-2.5 font-display text-ink">Approve payment</button>
                <button onClick={() => setStatus(r, "rejected")} className="rounded-full border border-border px-5 py-2.5 font-display">Reject / review</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-8 text-xs text-muted-foreground">Only approve after checking your bank/UPI app shows ₹8,500 received for this UTR. A screenshot alone is not proof.</p>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink px-5 py-8 text-bone md:px-10">
      <Link to="/" className="eyebrow">← Titu Backpackers</Link>
      <div className="mx-auto mt-8 max-w-4xl">{children}</div>
    </div>
  );
}
