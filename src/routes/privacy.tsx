import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/site/PageShell";
import { TRIP } from "@/lib/trip";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Coorg 2026 | Titu Backpackers" },
      { name: "description", content: "How Titu Backpackers handles your registration and payment data for Coorg 2026." },
      { property: "og:title", content: "Privacy Policy — Coorg 2026" },
      { property: "og:description", content: "What we collect, why, and who sees it." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <PageShell>
      <h1 className="font-display text-6xl md:text-8xl">Privacy.</h1>
      <p className="eyebrow mt-4 text-muted-foreground">Version {TRIP.policyVersion}</p>
      <div className="mt-10 space-y-6 leading-relaxed text-bone/85">
        <h2 className="font-display text-3xl">What we collect</h2>
        <p>Your full name, email address, phone number, UPI transaction ID (UTR), payment screenshot, and the time you accepted our terms.</p>
        <h2 className="font-display text-3xl">Why</h2>
        <p>Only to manage your registration for Coorg 2026, verify your payment and contact you about the trip.</p>
        <h2 className="font-display text-3xl">Who can see it</h2>
        <p>Only you and the trip organizers. Payment screenshots are stored privately and are never public. We do not sell or share your data with advertisers.</p>
        <h2 className="font-display text-3xl">How long</h2>
        <p>We keep registration data until the trip and any related payment matters are settled, then delete it.</p>
        <h2 className="font-display text-3xl">Your choices</h2>
        <p>To see, correct or delete your data, DM @{TRIP.instagram} on Instagram.</p>
      </div>
    </PageShell>
  );
}
