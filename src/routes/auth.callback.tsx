import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/site/PageShell";
import {
  resumeRegistrationByVerifiedEmailServer,
  type GuestRegistrationSession,
} from "@/lib/registration.functions";

const SESSION_KEY = "titu_coorg2026_reg_v2";

function saveSessionToStorages(next: GuestRegistrationSession) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore storage errors
  }
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore storage errors
  }
}

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "Verifying Email — Coorg 2026 | Titu Backpackers" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function handleCallback() {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(
          window.location.hash.startsWith("#")
            ? window.location.hash.slice(1)
            : window.location.hash,
        );

        const urlError =
          searchParams.get("error_description") ||
          hashParams.get("error_description") ||
          searchParams.get("error") ||
          hashParams.get("error");

        if (urlError) {
          throw new Error(decodeURIComponent(urlError.replace(/\+/g, " ")));
        }

        const code = searchParams.get("code");
        const tokenHash = searchParams.get("token_hash");
        const rawType = searchParams.get("type") || hashParams.get("type") || "email";

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash) {
          const validType = (
            ["email", "magiclink", "signup", "recovery", "invite"].includes(rawType)
              ? rawType
              : "email"
          ) as "email" | "magiclink" | "signup" | "recovery" | "invite";
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: validType,
          });
          if (error) throw error;
        }

        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;

        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          throw new Error(
            "This verification link has expired or was already used. Please request a new 6-digit verification code on the registration page.",
          );
        }

        const resumed = await resumeRegistrationByVerifiedEmailServer({
          data: { accessToken },
        });

        if (!active) return;
        saveSessionToStorages(resumed);
        void navigate({ to: "/register", replace: true });
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof Error
            ? err.message
            : "This verification link is invalid or has expired. Please request a new 6-digit code.";
        setErrorMessage(msg);
      }
    }

    void handleCallback();
    return () => {
      active = false;
    };
  }, [navigate]);

  if (errorMessage) {
    return (
      <PageShell>
        <p className="eyebrow text-ember">Verification Issue</p>
        <h1 className="font-display mt-3 text-5xl md:text-7xl">Link Expired or Invalid.</h1>
        <p className="mt-4 text-bone/80">{errorMessage}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          You can return to the registration page, select &ldquo;Already Registered? Continue Your
          Booking&rdquo;, and request a fresh 6-digit verification code.
        </p>
        <Link
          to="/register"
          className="mt-8 inline-block rounded-full bg-ember px-6 py-4 font-display text-xl text-ink"
        >
          Return to Registration →
        </Link>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <p className="eyebrow text-ember">Verifying Identity</p>
      <h1 className="font-display mt-3 text-5xl md:text-7xl">Restoring your booking…</h1>
      <p className="mt-3 text-bone/80">
        Please wait a moment while we verify your email and load your Coorg 2026 registration.
      </p>
    </PageShell>
  );
}
