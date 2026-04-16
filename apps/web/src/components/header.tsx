import { Link } from "@tanstack/react-router";
import { ConnectWallet } from "./connect-wallet";

export default function Header() {
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link to="/" className="flex items-center gap-2.5 group">
          <img src="/logo.png" alt="ShipProof" className="h-8 w-auto" />
          <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
            ShipProof
          </span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link
            to="/attest"
            className="font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-primary [&.active]:text-primary"
          >
            Attest
          </Link>
          <ConnectWallet />
        </nav>
      </div>
    </header>
  );
}
