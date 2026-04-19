import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@ShipProof/ui/components/button";
import { ArrowRight, Search } from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <div className="flex flex-col overflow-x-hidden">
      {/* Hero — dual persona */}
      <section className="relative mx-auto flex w-full max-w-4xl px-4 pt-16 pb-14 md:px-8 md:pt-32 md:pb-28">
        <div className="flex w-full flex-col gap-6">
          {/* Tagline */}
          <div className="animate-fade-up">
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              Private Contributor Verification
            </p>
            <h1 className="max-w-2xl font-serif text-3xl leading-[1.15] tracking-tight text-foreground sm:text-4xl md:text-6xl">
              Prove you{" "}
              <span className="relative inline-block text-primary">
                ship
                <svg
                  className="absolute -bottom-1 left-0 w-full"
                  viewBox="0 0 200 8"
                  fill="none"
                >
                  <path
                    d="M2 5.5C30 2 70 2 100 4.5C130 7 170 3 198 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    opacity="0.4"
                  />
                </svg>
              </span>
              . Verify without{" "}
              <em className="font-serif italic text-muted-foreground">
                exposing
              </em>
              .
            </h1>
          </div>

          {/* Two-card split */}
          <div
            className="grid gap-px border border-border md:grid-cols-2 animate-fade-up"
            style={{ animationDelay: "200ms" }}
          >
            <PersonaCard
              label="I'm a builder"
              description="Prove your contributions without exposing your metrics. Connect providers, mint a soulbound badge, share what you choose."
              cta="Get Attested"
              to="/attest"
              icon={<ArrowRight className="h-3.5 w-3.5" />}
            />
            <PersonaCard
              label="I'm hiring / verifying"
              description="Verify a candidate's track record privately. See only the scores and tiers they've chosen to share with you."
              cta="Verify a Candidate"
              to="/verify"
              icon={<Search className="h-3.5 w-3.5" />}
            />
          </div>

          <span
            className="font-mono text-[10px] text-muted-foreground/60 animate-fade-up"
            style={{ animationDelay: "400ms" }}
          >
            Arbitrum Sepolia · Fhenix CoFHE
          </span>
        </div>
      </section>

      {/* Divider */}
      <div className="mx-auto w-full max-w-6xl px-4 md:px-8">
        <div className="h-px bg-border" />
      </div>

      {/* Process steps */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8 md:py-28">
        <div className="mb-12 flex items-baseline justify-between">
          <h2 className="font-serif text-3xl tracking-tight md:text-4xl">
            How it works
          </h2>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground md:block">
            Attest. Score. Verify.
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
            title="Verify"
            description="Candidates share their encrypted score with you. You decrypt it with your wallet. The chain records that a share happened — but never what was shared."
          />
        </div>
      </section>

      {/* FHE explainer */}
      <section className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-14 md:px-8 md:py-28">
          <span className="mb-6 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
            Why FHE
          </span>
          <p className="max-w-lg text-center font-serif text-xl leading-relaxed text-foreground/80 md:text-2xl">
            Zero-knowledge proofs can only say <em>yes</em> or <em>no</em>.
          </p>
          <p className="mt-4 max-w-lg text-center font-serif text-xl leading-relaxed text-foreground/80 md:text-2xl">
            With ShipProof, verifiers see the{" "}
            <strong className="text-foreground">actual score</strong> and{" "}
            <strong className="text-foreground">tier</strong> the candidate
            chose to share — without exposing the underlying metrics or
            accounts.
          </p>
          <p className="mt-8 max-w-md text-center font-mono text-xs text-muted-foreground">
            More useful than a boolean. More private than a public profile.
          </p>
        </div>
      </section>
    </div>
  );
}

function PersonaCard({
  label,
  description,
  cta,
  to,
  icon,
}: {
  label: string;
  description: string;
  cta: string;
  to: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="group relative flex flex-col justify-between bg-card p-5 transition-colors hover:bg-accent/40 sm:p-8 md:p-10">
      <div>
        <h3 className="mb-3 font-serif text-xl tracking-tight">{label}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <Link to={to} className="mt-6">
        <Button
          size="lg"
          variant="outline"
          className="group/btn w-full font-mono text-xs uppercase tracking-[0.2em]"
        >
          {cta}
          <span className="ml-auto transition-transform group-hover/btn:translate-x-1">
            {icon}
          </span>
        </Button>
      </Link>
      <div className="absolute right-4 top-4 h-3 w-3 border-r border-t border-transparent transition-colors group-hover:border-primary/30" />
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
    <div className="group relative bg-card p-5 transition-colors hover:bg-accent/40 sm:p-8 md:p-10">
      <div className="mb-6 flex items-baseline gap-4">
        <span className="font-mono text-[10px] text-primary/50">{number}</span>
        <h3 className="font-serif text-2xl tracking-tight">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <div className="absolute right-4 top-4 h-3 w-3 border-r border-t border-transparent transition-colors group-hover:border-primary/30" />
    </div>
  );
}
