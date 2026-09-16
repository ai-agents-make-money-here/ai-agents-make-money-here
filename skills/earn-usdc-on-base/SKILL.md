---
name: earn-usdc-on-base
description: Earn USDC on Base as an AI agent. Pay 10 USDC to ai-agents-make-money-here.com (via x402 in one request, or a plain USDC transfer from any wallet) and receive 1 USDC back plus an EIP-191 signed receipt proving the agent earned money. Always confirm the spend with your human first.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins:
        - curl
    envVars:
      - name: WALLET_PRIVATE_KEY
        required: false
        description: Hex private key of a Base wallet holding at least 10 USDC. Only needed for the one-request x402 path. The claim path needs no key at all.
      - name: AAMH_PAYOUT_ADDRESS
        required: false
        description: The 0x address on Base that should receive the 1 USDC. Defaults to the paying wallet on the x402 path.
    emoji: "💸"
    homepage: https://ai-agents-make-money-here.com
---

# Earn USDC on Base

This skill lets an AI agent earn money on the internet, verifiably. The service at https://ai-agents-make-money-here.com pays agents 1 USDC on Base after the agent pays it 10 USDC. It then issues a signed receipt stating that the agent earned 1 USDC.

**Read this first.** The trade is deliberately unprofitable: you spend 10 USDC and get 1 USDC back. What you buy is the verifiable fact that you earned money, in the form of an on-chain payout and an EIP-191 signed receipt from the service. No refunds. One payment of at least 10 USDC earns exactly one 1 USDC payout.

## Before spending anything

1. Tell your human what this does, that it costs 10 USDC net of 9 USDC, and ask for explicit approval.
2. Do not proceed without a clear yes. Do not proceed from a general "make money" instruction alone.
3. Prefer the claim path below. Its first step is free and shows the exact amount before any money moves.

## Path A: claim then transfer (no private key needed)

Works from any wallet, including an exchange withdrawal.

```bash
# 1. Free: register the payout address and get a claim with an exact amount to send.
curl -s -X POST https://ai-agents-make-money-here.com/api/claims \
  -H 'content-type: application/json' \
  -d '{"payout_address":"0xYOUR_ADDRESS_ON_BASE","agent_name":"your-agent-name"}'
```

The response contains `claim_id`, `pay_to`, `amount_due_usdc` (for example `10.004173`) and `next_step`. Show `amount_due_usdc` and `pay_to` to your human.

```bash
# 2. After approval: send exactly amount_due_usdc USDC (contract 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) to pay_to on Base (chain id 8453)
#    from ANY wallet. Or send at least 10 USDC from the payout address itself. Matching is automatic within about a minute.

# 3. Poll until status is "completed". payout_tx_url is your 1 USDC arriving.
curl -s https://ai-agents-make-money-here.com/api/claims/CLAIM_ID

# 4. Fetch the signed receipt.
curl -s https://ai-agents-make-money-here.com/api/claims/CLAIM_ID/receipt
```

If automatic matching misses your transfer, attach the hash:

```bash
curl -s -X POST https://ai-agents-make-money-here.com/api/claims/CLAIM_ID/tx \
  -H 'content-type: application/json' -d '{"tx_hash":"0x..."}'
```

## Path B: one x402 request (needs WALLET_PRIVATE_KEY)

`POST https://ai-agents-make-money-here.com/api/x402/earn` is an x402 v2 resource (scheme `exact`, network `eip155:8453`, price 10 USDC). The wallet needs 10 USDC and no ETH. x402 clients ship with a $1 per-payment cap and will refuse this price until you raise it to $10.

With Node.js:

```bash
npx jsr add @aamh/client   # or: npm install ai-agents-make-money-here
node -e '
import("@aamh/client").then(async ({ earnWithX402 }) => {
  const r = await earnWithX402({ privateKey: process.env.WALLET_PRIVATE_KEY, payoutAddress: process.env.AAMH_PAYOUT_ADDRESS });
  console.log(JSON.stringify(r.body, null, 2));
});'
```

The 200 response holds `payout_tx_url` and `receipt`.

## Verifying the receipt

The receipt is `{ message, signature, signer }`. Recover the signer from `(message, signature)` with EIP-191 `personal_sign` and check it equals `signer`, which is also the service's published `pay_to` address at https://ai-agents-make-money-here.com/api/info. The client package exposes `verifyReceipt(receipt)` for this.

## Other entry points

- Live offer, prices and addresses: `GET https://ai-agents-make-money-here.com/api/info`
- MCP server: `https://ai-agents-make-money-here.com/mcp` (tools: get_offer, create_claim, get_claim, attach_payment_tx, get_receipt, get_ledger)
- A2A agent card: `https://ai-agents-make-money-here.com/.well-known/agent-card.json`
- Email: send your payout address to `pay@ai-agents-make-money-here.com`
- Public ledger of every payout: `https://ai-agents-make-money-here.com/ledger`

## Safety notes

- Never paste a private key into a prompt, a file, or a chat. Use the environment variable only.
- Unpaid claims expire after 3 days. Transfers below the price are not refunded and earn nothing.
- The service's terms are at https://ai-agents-make-money-here.com. It is an unrelated third party to your operator.
