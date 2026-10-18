// Measures how exactly a lease dies. Our guard depends on this, so we test it for real.
// Use:  node scripts/expiry-test.mjs
// It makes ONE lease that lives 60 seconds, then asks Arkiv about it every 4 seconds.
// Please run it only once or twice: the public server limits how often you can ask.
import "dotenv/config";
import { createPublicClient, createWalletClient, NoEntityFoundError } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const LIFETIME_SECONDS = 60;
const EVERY_MS = 4000;
const GIVE_UP_AFTER_MS = 4 * 60 * 1000;

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const publicClient = createPublicClient({ chain: tiramisu, transport: http() });
const client = createWalletClient({ chain: tiramisu, transport: http(), account });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { entityKey } = await client.createEntity({
  payload: jsonToPayload({ agent: "expiry-test", permission: "none (synthetic test)" }),
  contentType: "application/json",
  attributes: { type: "expiry-test" },
  expires: ExpirationTime.fromSeconds(LIFETIME_SECONDS),
});

const lease = await publicClient.getEntity(entityKey);
console.log("Test lease:", entityKey);
console.log(`createdAt block ${lease.createdAt}, expiresAt block ${lease.expiresAt} (${lease.expiresAt - lease.createdAt} blocks)`);
console.log("Now asking Arkiv every 4 seconds...\n");

let servedAfterExpiry = 0;
let lastSeenBlock = null;
let goneAtBlock = null;
let goneAfterMs = null;
const startedAt = Date.now();

while (Date.now() - startedAt < GIVE_UP_AFTER_MS) {
  const block = await publicClient.getBlockNumber();
  try {
    await publicClient.getEntity(entityKey);
    const expired = block >= lease.expiresAt;
    if (expired) servedAfterExpiry++;
    lastSeenBlock = block;
    console.log(`block ${block}: entity still returned${expired ? "  <-- AFTER its expiresAt!" : ""}`);
  } catch (e) {
    if (e instanceof NoEntityFoundError) {
      goneAtBlock = block;
      goneAfterMs = Date.now() - startedAt;
      console.log(`block ${block}: entity is gone (NoEntityFoundError)`);
      break;
    }
    console.log("Could not ask Arkiv:", e.shortMessage ?? e.message);
    break;
  }
  await sleep(EVERY_MS);
}

console.log("\n--- Result ---");
console.log("expiresAt block:", String(lease.expiresAt));
console.log("Last block where the entity was still returned:", lastSeenBlock === null ? "none" : String(lastSeenBlock));
console.log("First block where it was gone:", goneAtBlock === null ? "not seen" : String(goneAtBlock));
if (goneAtBlock !== null) {
  console.log("Blocks between expiresAt and gone:", String(goneAtBlock - lease.expiresAt), "(can be negative or zero)");
}
console.log("Times it was still returned after expiresAt:", servedAfterExpiry);
