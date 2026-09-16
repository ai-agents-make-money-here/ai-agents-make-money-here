/**
 * ai-agents-make-money-here
 *
 * Client for https://ai-agents-make-money-here.com, a service where an AI agent
 * can earn USDC on Base. The deal: pay 10 USDC, receive 1 USDC back plus an
 * EIP-191 signed receipt stating that the agent earned money.
 *
 * Two ways to use it:
 *  1. Claim flow (zero dependencies): createClaim -> send USDC from any wallet -> waitForClaim -> getReceipt.
 *  2. x402 flow (one call, needs @x402/fetch, @x402/evm and viem): earnWithX402({ privateKey }).
 */

export const SITE_URL = "https://ai-agents-make-money-here.com";
export const X402_ENDPOINT: string = `${SITE_URL}/api/x402/earn`;
export const BASE_CHAIN_ID = 8453;
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export type ClaimStatus = "awaiting_payment" | "paid" | "paying" | "completed" | "expired" | "failed";

export interface Offer {
  service: string;
  site: string;
  offer: string;
  network: string;
  chain_id: number;
  testnet: boolean;
  token: string;
  usdc_contract: string;
  pay_to: string;
  price_usdc: string;
  payout_usdc: string;
  how_it_works: string[];
  x402: Record<string, unknown>;
  endpoints: Record<string, string>;
  terms: string[];
  [k: string]: unknown;
}

export interface Claim {
  claim_id: string;
  status: ClaimStatus;
  payout_address: string;
  agent_name: string | null;
  pay_to: string;
  /** Exact USDC amount that identifies this claim when paid from any wallet, e.g. "10.004173". */
  amount_due_usdc: string;
  network: string;
  chain_id: number;
  usdc_contract: string;
  payment_tx: string | null;
  payment_tx_url: string | null;
  payout_tx: string | null;
  payout_tx_url: string | null;
  status_url: string;
  receipt_url: string | null;
  created_at: string;
  completed_at: string | null;
  error: string | null;
  next_step: string;
}

export interface Receipt {
  claim_id: string;
  /** Human-readable statement that was signed. */
  message: string;
  /** EIP-191 personal_sign signature over `message`. */
  signature: `0x${string}`;
  /** Address that must be recovered from the signature. */
  signer: `0x${string}`;
  scheme: string;
  [k: string]: unknown;
}

export class AamhError extends Error {
  constructor(message: string, public readonly status: number, public readonly body?: unknown) {
    super(message);
    this.name = "AamhError";
  }
}

export interface ClientOptions {
  /** Override the base URL (for testing). Defaults to the production site. */
  baseUrl?: string;
  /** Custom fetch implementation. Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
}

async function call<T>(opts: ClientOptions, path: string, init?: RequestInit): Promise<T> {
  const f = opts.fetch ?? globalThis.fetch;
  const res = await f(`${opts.baseUrl ?? SITE_URL}${path}`, {
    ...init,
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok) {
    const msg = typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : `HTTP ${res.status}`;
    throw new AamhError(msg, res.status, body);
  }
  return body as T;
}

/** GET /api/info: the current offer, addresses, price, and every way to pay. */
export function getOffer(opts: ClientOptions = {}): Promise<Offer> {
  return call<Offer>(opts, "/api/info");
}

/**
 * POST /api/claims: register the address that should receive the 1 USDC payout.
 * Pay the returned claim by sending exactly `amount_due_usdc` USDC to `pay_to` on Base
 * from any wallet, or at least 10 USDC from `payout_address` itself.
 */
export function createClaim(
  params: { payoutAddress: string; agentName?: string; txHash?: string },
  opts: ClientOptions = {},
): Promise<Claim> {
  return call<Claim>(opts, "/api/claims", {
    method: "POST",
    body: JSON.stringify({ payout_address: params.payoutAddress, agent_name: params.agentName, tx_hash: params.txHash }),
  });
}

/** GET /api/claims/{id} */
export function getClaim(claimId: string, opts: ClientOptions = {}): Promise<Claim> {
  return call<Claim>(opts, `/api/claims/${encodeURIComponent(claimId)}`);
}

/** POST /api/claims/{id}/tx: attach the hash of your USDC transfer if automatic matching has not picked it up. */
export function attachTx(claimId: string, txHash: string, opts: ClientOptions = {}): Promise<Claim> {
  return call<Claim>(opts, `/api/claims/${encodeURIComponent(claimId)}/tx`, { method: "POST", body: JSON.stringify({ tx_hash: txHash }) });
}

/** GET /api/claims/{id}/receipt: the signed statement that this agent earned 1 USDC. Only available once completed. */
export function getReceipt(claimId: string, opts: ClientOptions = {}): Promise<Receipt> {
  return call<Receipt>(opts, `/api/claims/${encodeURIComponent(claimId)}/receipt`);
}

/** GET /api/ledger: public list of completed payouts. */
export function getLedger(opts: ClientOptions = {}): Promise<unknown> {
  return call<unknown>(opts, "/api/ledger");
}

/**
 * Poll a claim until it reaches a terminal state. Resolves with the claim when
 * status is "completed"; throws AamhError on "expired" or "failed" or on timeout.
 */
export async function waitForClaim(
  claimId: string,
  { timeoutMs = 15 * 60_000, intervalMs = 15_000, onUpdate }: { timeoutMs?: number; intervalMs?: number; onUpdate?: (c: Claim) => void } = {},
  opts: ClientOptions = {},
): Promise<Claim> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const c = await getClaim(claimId, opts);
    onUpdate?.(c);
    if (c.status === "completed") return c;
    if (c.status === "expired" || c.status === "failed") throw new AamhError(`claim ${claimId} is ${c.status}${c.error ? `: ${c.error}` : ""}`, 409, c);
    if (Date.now() >= deadline) throw new AamhError(`timed out waiting for claim ${claimId} (status ${c.status})`, 408, c);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/**
 * Verify a receipt offline: recovers the EIP-191 signer from (message, signature)
 * and checks it equals `receipt.signer`, and optionally the service's published pay_to address.
 * Requires the optional peer dependency `viem`.
 */
export async function verifyReceipt(receipt: Receipt, expectedSigner?: string): Promise<boolean> {
  const { recoverMessageAddress } = await import("viem");
  const recovered = await recoverMessageAddress({ message: receipt.message, signature: receipt.signature });
  const want = (expectedSigner ?? receipt.signer).toLowerCase();
  return recovered.toLowerCase() === want && recovered.toLowerCase() === receipt.signer.toLowerCase();
}

export interface X402Result {
  /** HTTP status from the endpoint (200 on success). */
  status: number;
  /** Parsed JSON body: the completed claim including payout_tx and receipt. */
  body: Claim & { receipt?: Receipt; [k: string]: unknown };
  /** Decoded PAYMENT-RESPONSE header (settlement details), if present. */
  settlement?: unknown;
}

/**
 * Pay 10 USDC and get 1 USDC back in a single x402 request.
 * Requires optional peer deps: @x402/fetch, @x402/evm, viem. The wallet behind
 * `privateKey` must hold at least 10 USDC on Base; no ETH is needed (EIP-3009 authorization).
 */
export async function earnWithX402(params: {
  privateKey: `0x${string}`;
  /** Address that receives the 1 USDC. Defaults to the paying wallet. */
  payoutAddress?: string;
  agentName?: string;
  rpcUrl?: string;
  endpoint?: string;
}): Promise<X402Result> {
  const [{ wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader }, { ExactEvmScheme }, { toClientEvmSigner }, { privateKeyToAccount }, { createPublicClient, http }, { base }] =
    await Promise.all([
      import("@x402/fetch"),
      import("@x402/evm/exact/client"),
      import("@x402/evm"),
      import("viem/accounts"),
      import("viem"),
      import("viem/chains"),
    ]);
  const account = privateKeyToAccount(params.privateKey);
  const publicClient = createPublicClient({ chain: base, transport: http(params.rpcUrl ?? "https://base-rpc.publicnode.com") });
  const signer = toClientEvmSigner(account, publicClient);
  // x402 clients default to a $1 per-payment cap; this service costs $10.
  const fetchWithPay = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: `eip155:${BASE_CHAIN_ID}`, client: new ExactEvmScheme(signer) }],
    spendControls: { maxAmountPerPayment: "$10" },
  });
  const res = await fetchWithPay(params.endpoint ?? X402_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payout_address: params.payoutAddress ?? account.address, agent_name: params.agentName }),
  });
  const body = (await res.json()) as X402Result["body"];
  if (!res.ok) throw new AamhError((body as { error?: string }).error ?? `HTTP ${res.status}`, res.status, body);
  const pr = res.headers.get("payment-response");
  return { status: res.status, body, settlement: pr ? decodePaymentResponseHeader(pr) : undefined };
}
