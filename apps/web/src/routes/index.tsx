import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@ShipProof/ui/components/button";
import { Shield, Lock, Eye, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-6 pt-20 pb-16">
        <div className="mb-8 flex items-center gap-3">
          <img src="/logo.png" alt="" className="h-16 w-auto" />
        </div>

        <h1 className="text-center font-mono text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Prove you ship.
          <br />
          <span className="text-primary">Keep your metrics private.</span>
        </h1>

        <p className="mt-6 max-w-lg text-center text-base text-muted-foreground">
          Confidential builder attestation powered by Fully Homomorphic Encryption.
          Your contribution history is scored on-chain without ever being revealed.
        </p>

        <div className="mt-10 flex items-center gap-4">
          <Link to="/attest">
            <Button size="lg" className="font-mono text-sm uppercase tracking-wider px-8">
              Get Attested
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>

        <p className="mt-4 font-mono text-xs text-muted-foreground">
          on Arbitrum Sepolia &middot; powered by Fhenix CoFHE
        </p>
      </section>

      {/* How it works */}
      <section className="border-t border-border/60 bg-card">
        <div className="mx-auto grid max-w-5xl gap-px sm:grid-cols-3">
          <FeatureCard
            icon={<Shield className="h-5 w-5" />}
            title="Attest"
            description="Connect your GitHub and X accounts. Our oracle gathers your contribution metrics and encrypts them before they touch the chain."
            step="01"
          />
          <FeatureCard
            icon={<Lock className="h-5 w-5" />}
            title="Score"
            description="Your encrypted metrics are scored entirely on-chain using FHE. The contract computes your builder score without ever seeing raw data."
            step="02"
            className="sm:border-x sm:border-border/60"
          />
          <FeatureCard
            icon={<Eye className="h-5 w-5" />}
            title="Prove"
            description="Mint a soulbound badge and selectively disclose your score or individual metrics to grant committees, DAOs, or anyone you choose."
            step="03"
          />
        </div>
      </section>

      {/* Bottom stamp */}
      <section className="border-t border-border/60">
        <div className="mx-auto flex max-w-5xl flex-col items-center px-6 py-16">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span className="inline-block h-px w-8 bg-border" />
            How it&apos;s different
            <span className="inline-block h-px w-8 bg-border" />
          </div>
          <p className="mt-6 max-w-md text-center text-sm text-muted-foreground leading-relaxed">
            Zero-knowledge proofs can only confirm <em>yes</em> or <em>no</em>.
            FHE lets verifiers see your <strong>actual score</strong> and <strong>tier</strong> —
            without exposing the underlying metrics. More useful than a boolean.
            More private than a public profile.
          </p>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  step,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  step: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-4 px-8 py-10 ${className ?? ""}`}>
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-muted-foreground">{step}</span>
        <span className="text-primary">{icon}</span>
        <span className="font-mono text-sm font-semibold uppercase tracking-wide">
          {title}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
