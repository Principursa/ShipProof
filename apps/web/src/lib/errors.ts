/** Extract a short, user-friendly message from viem/wagmi errors. */
export function friendlyError(err: unknown): string {
  if (!(err instanceof Error)) return "Transaction failed";
  const msg = err.message;
  if (msg.includes("User rejected")) return "Transaction rejected";
  if (msg.includes("User denied")) return "Transaction rejected";
  if (msg.includes("ScoreBelowThreshold")) return "Score below threshold";
  if (msg.includes("NonceAlreadyUsed"))
    return "Attestation already submitted — nonce reused";
  if (msg.includes("AttestationExpired"))
    return "Attestation expired — please retry";
  if (msg.includes("InvalidSignature")) return "Invalid oracle signature";
  if (msg.includes("insufficient funds")) return "Insufficient funds for gas";
  const firstLine = msg.split("\n")[0] ?? msg;
  if (firstLine.length > 120) return firstLine.slice(0, 120) + "…";
  return firstLine;
}
