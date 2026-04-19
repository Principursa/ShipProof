import { Link } from "@tanstack/react-router";
import { ConnectWallet } from "./connect-wallet";

export default function Header() {
  return (
    <header className="border-b border-border/50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8 md:py-4">
        <Link to="/" className="flex items-center gap-2 group md:gap-3">
          <img
            src="/logo.png"
            alt="ShipProof"
            className="h-6 w-auto transition-transform group-hover:rotate-[-3deg] md:h-7"
          />
          <span className="hidden font-serif text-lg tracking-tight text-foreground sm:inline">
            ShipProof
          </span>
        </Link>

        <nav className="flex items-center gap-3 md:gap-8">
          <Link
            to="/attest"
            className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground md:text-[11px] md:tracking-[0.2em] [&.active]:text-primary"
          >
            Attest
          </Link>
          <Link
            to="/verify"
            className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground md:text-[11px] md:tracking-[0.2em] [&.active]:text-primary"
          >
            Verify
          </Link>
          <div className="hidden h-4 w-px bg-border sm:block" />
          <ConnectWallet />
        </nav>
      </div>
    </header>
  );
}
