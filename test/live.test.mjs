import { test } from "node:test";
import assert from "node:assert/strict";
import { getOffer, getClaim, getReceipt, verifyReceipt, getLedger } from "../dist/index.js";

test("offer is live", async () => {
  const o = await getOffer();
  assert.equal(o.chain_id, 8453);
  assert.equal(o.price_usdc, "10");
  assert.equal(o.payout_usdc, "1");
});

test("completed claim and its receipt verify", async () => {
  const c = await getClaim("clm_d68ae9668b461047");
  assert.equal(c.status, "completed");
  const r = await getReceipt(c.claim_id);
  assert.equal(r.signer.toLowerCase(), c.pay_to.toLowerCase());
  assert.equal(await verifyReceipt(r, c.pay_to), true);
  assert.equal(await verifyReceipt({ ...r, message: r.message + "x" }), false);
});

test("ledger returns rows", async () => {
  const l = await getLedger();
  assert.ok(l && typeof l === "object");
});

test("bad address is a 400 AamhError", async () => {
  const { createClaim, AamhError } = await import("../dist/index.js");
  await assert.rejects(createClaim({ payoutAddress: "nope" }), (e) => e instanceof AamhError && e.status === 400);
});
