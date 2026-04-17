import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@ShipProof/ui/components/button";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <div className="flex flex-col overflow-x-hidden">
      {/* Hero */}
      <section className="relative mx-auto flex w-full max-w-3xl px-8 pt-24 pb-20 md:pt-32 md:pb-28">
        <div className="flex w-full flex-col gap-8 md:flex-row md:items-end md:gap-12">
          {/* Left: headline */}
          <div className="max-w-xl animate-fade-up">
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              Confidential Attestation Protocol
            </p>
            <h1 className="font-serif text-5xl leading-[1.1] tracking-tight text-foreground md:text-7xl">
              Prove you{" "}
              <span className="relative inline-block text-primary">
                ship
                <svg className="absolute -bottom-1 left-0 w-full" viewBox="0 0 200 8" fill="none">
                  <path d="M2 5.5C30 2 70 2 100 4.5C130 7 170 3 198 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
                </svg>
              </span>
              .
              <br />
              Keep your
              <br />
              metrics{" "}
              <em className="font-serif italic text-muted-foreground">private</em>.
            </h1>
          </div>

          {/* Right: stamp + CTA */}
          <div className="flex flex-col items-start gap-6 md:items-end animate-fade-up" style={{ animationDelay: "200ms" }}>
            <img
              src="/logo.png"
              alt="ShipProof seal"
              className="h-28 w-auto animate-stamp opacity-0 md:h-36"
              style={{ animationDelay: "600ms" }}
            />
            <div className="flex flex-col items-start gap-3 md:items-end">
              <Link to="/attest">
                <Button size="lg" className="group px-8 font-mono text-xs uppercase tracking-[0.2em]">
                  Get Attested
                  <ArrowRight className="ml-2 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <span className="font-mono text-[10px] text-muted-foreground/60">
                Arbitrum Sepolia &middot; Fhenix CoFHE
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto w-full max-w-6xl px-8">
        <div className="h-px bg-border" />
      </div>

      {/* Process steps */}
      <section className="mx-auto w-full max-w-6xl px-8 py-20 md:py-28">
        <div className="mb-12 flex items-baseline justify-between">
          <h2 className="font-serif text-3xl tracking-tight md:text-4xl">How it works</h2>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground md:block">
            Three transactions. One badge.
          </span>
        </div>

        <div className="stagger-children grid gap-px border border-border md:grid-cols-3">
          <ProcessStep
            number="01"
            title="Attest"
            description="Connect GitHub and X. The oracle gathers your contribution metrics and encrypts them before they touch the chain. Your raw data never leaves the server."
          />
          <ProcessStep
            number="02"
            title="Score"
            description="Encrypted metrics are scored entirely on-chain using Fully Homomorphic Encryption. The contract computes your builder score without decrypting anything."
          />
          <ProcessStep
            number="03"
            title="Prove"
            description="Mint a soulbound badge. Selectively disclose your score, tier, or individual metrics to grant committees, DAOs, or anyone you choose."
          />
        </div>
      </section>

      {/* FHE explainer */}
      <section className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-8 py-20 md:py-28">
          <span className="mb-6 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
            Why FHE
          </span>
          <p className="max-w-lg text-center font-serif text-xl leading-relaxed text-foreground/80 md:text-2xl">
            Zero-knowledge proofs can only say <em>yes</em> or <em>no</em>.
          </p>
          <p className="mt-4 max-w-lg text-center font-serif text-xl leading-relaxed text-foreground/80 md:text-2xl">
            FHE lets verifiers see your <strong className="text-foreground">actual score</strong> and{" "}
            <strong className="text-foreground">tier</strong> — without exposing the underlying metrics.
          </p>
          <p className="mt-8 max-w-md text-center font-mono text-xs text-muted-foreground">
            More useful than a boolean. More private than a public profile.
          </p>
        </div>
      </section>
    </div>
  );
}

function ProcessStep({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="group relative bg-card p-8 transition-colors hover:bg-accent/40 md:p-10">
      <div className="mb-6 flex items-baseline gap-4">
        <span className="font-mono text-[10px] text-primary/50">{number}</span>
        <h3 className="font-serif text-2xl tracking-tight">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      {/* Corner accent on hover */}
      <div className="absolute right-4 top-4 h-3 w-3 border-r border-t border-transparent transition-colors group-hover:border-primary/30" />
    </div>
  );
}
