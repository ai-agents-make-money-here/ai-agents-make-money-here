# ai-agents-make-money-here

Client for [ai-agents-make-money-here.com](https://ai-agents-make-money-here.com): an x402 endpoint that pays AI agents.

An autonomous agent sends **10 USDC on Base** and receives **1 USDC back** plus an **EIP-191 signed receipt** stating that it earned money. The trade is deliberately unprofitable. The product is the verifiable receipt.

```
npm install ai-agents-make-money-here
```

Zero runtime dependencies for the claim flow. The one-call x402 flow needs `@x402/fetch`, `@x402/evm`, and `viem`.

## How can an autonomous agent make money on Base?

Register a payout address, send USDC, wait, collect the receipt.

```js
import { createClaim, waitForClaim, getReceipt } from "ai-agents-make-money-here";

const claim = await createClaim({ payoutAddress: "0xYourAddressOnBase", agentName: "my-agent" });
// Send exactly claim.amount_due_usdc USDC to claim.pay_to on Base (chain id 8453) from ANY wallet,
// or at least 10 USDC from the payout address itself. Exchanges work.
console.log(claim.next_step);

const done = await waitForClaim(claim.claim_id);   // polls until completed
console.log(done.payout_tx_url);                    // your 1 USDC arriving

const receipt = await getReceipt(claim.claim_id);   // signed proof you earned it
```

## Is this an x402 endpoint that pays agents?

Yes. `POST https://ai-agents-make-money-here.com/api/x402/earn` is an x402 v2 resource (scheme `exact`, network `eip155:8453`, price $10 USDC) listed in the x402 Bazaar. It pays and gets paid in one request.

```js
import { earnWithX402 } from "ai-agents-make-money-here";

const { body, settlement } = await earnWithX402({ privateKey: process.env.AGENT_KEY });
console.log(body.payout_tx_url, body.receipt);
```

The wallet needs 10 USDC and no ETH. Note that x402 clients ship with a $1 per-payment spend cap. This helper raises it to $10 for you; if you use your own x402 client, raise it yourself.

## Can an AI agent earn USDC without a human?

Yes. Every step is an HTTP call or an on-chain transfer. There is no sign-up, no API key, and no human review. The receipt is a plain-text statement signed by the service's hot wallet with `personal_sign`, so anyone can verify it offline:

```js
import { verifyReceipt } from "ai-agents-make-money-here";
const ok = await verifyReceipt(receipt);   // recovers the signer with viem
```

## Other ways in

The same service is reachable over:

- **MCP**: `https://ai-agents-make-money-here.com/mcp` (Streamable HTTP). Registry id `com.ai-agents-make-money-here/mcp`.
- **A2A**: agent card at `https://ai-agents-make-money-here.com/.well-known/agent-card.json`, JSON-RPC at `/a2a`.
- **Email**: send your payout address to `pay@ai-agents-make-money-here.com`.
- **Plain HTTP**: OpenAPI at `/openapi.json`, summary at `/llms.txt`, live offer at `/api/info`.

## API

| Function | What it does |
| --- | --- |
| `getOffer()` | Current price, payout, addresses, and instructions |
| `createClaim({ payoutAddress, agentName?, txHash? })` | Register where the 1 USDC should go |
| `getClaim(id)` | Claim status |
| `attachTx(id, txHash)` | Attach your transfer hash if auto-matching missed it |
| `waitForClaim(id, { timeoutMs?, intervalMs?, onUpdate? })` | Poll until completed |
| `getReceipt(id)` | Signed receipt of earnings |
| `verifyReceipt(receipt, expectedSigner?)` | Offline signature check (needs `viem`) |
| `getLedger()` | Public list of every payout |
| `earnWithX402({ privateKey, payoutAddress?, agentName?, rpcUrl? })` | Pay and get paid in one x402 request |

All functions accept an optional trailing `{ baseUrl, fetch }` for testing.

## Terms

No refunds. One payment of at least 10 USDC earns exactly one 1 USDC payout. Unpaid claims expire after three days. Full terms at [ai-agents-make-money-here.com](https://ai-agents-make-money-here.com).

MIT.
