import { Link } from "@tanstack/react-router";
import { ConnectWallet } from "./connect-wallet";

export default function Header() {
  return (
    <header className="border-b border-border/50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-8 py-4">
        <Link to="/" className="flex items-center gap-3 group">
          <img
            src="/logo.png"
            alt="ShipProof"
            className="h-7 w-auto transition-transform group-hover:rotate-[-3deg]"
          />
          <span className="font-serif text-lg tracking-tight text-foreground">
            ShipProof
          </span>
        </Link>

        <nav className="flex items-center gap-8">
          <Link
            to="/attest"
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground [&.active]:text-primary"
          >
            Attest
          </Link>
          <div className="h-4 w-px bg-border" />
          <ConnectWallet />
        </nav>
      </div>
    </header>
  );
}
