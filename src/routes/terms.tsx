import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/site/PageShell";
import { TRIP } from "@/lib/trip";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Coorg 2026 | Titu Backpackers" },
      { name: "description", content: "Terms and conditions for the unofficial Coorg 2026 student trip." },
      { property: "og:title", content: "Terms & Conditions — Coorg 2026" },
      { property: "og:description", content: "Payment, cancellation and participation terms." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <PageShell>
      <h1 className="font-display text-6xl md:text-8xl">Terms.</h1>
      <p className="eyebrow mt-4 text-muted-foreground">Version {TRIP.policyVersion}</p>
      <div className="mt-10 space-y-6 leading-relaxed text-bone/85">
        <p className="rounded-md border border-ember p-4 text-bone">Payments are non-refundable for voluntary participant cancellations, subject to applicable law.</p>
        <h2 className="font-display text-3xl">Unofficial trip</h2>
        <p>Coorg 2026 is an unofficial trip organized by students under the name Titu Backpackers. It is not an official Mesa School of Business event and is not organized, endorsed or supervised by Mesa.</p>
        <h2 className="font-display text-3xl">Price and payment</h2>
        <p>The trip costs ₹8,500 per person, payable in full at registration via UPI to {TRIP.upiId}. A seat is confirmed only after organizers manually verify receipt of payment. Submitting a UTR or screenshot does not by itself confirm a booking.</p>
        <h2 className="font-display text-3xl">Cancellations</h2>
        <p>If you voluntarily cancel, your payment is non-refundable, subject to applicable law. Nothing in these terms limits any rights you have under mandatory consumer protection law. If the organizers cancel the trip, they will contact registered participants about refunds.</p>
        <h2 className="font-display text-3xl">Casino Night</h2>
        <p>Casino Night is a social card-game evening only. There is no real-money betting, wagering, stakes or prizes.</p>
        <h2 className="font-display text-3xl">Conduct and safety</h2>
        <p>Participants are responsible for their own conduct and belongings and must follow local laws and reasonable instructions from organizers. Organizers may refuse participation for unsafe or abusive behaviour.</p>
        <h2 className="font-display text-3xl">Contact</h2>
        <p>Questions: Instagram @{TRIP.instagram}.</p>
      </div>
    </PageShell>
  );
}
