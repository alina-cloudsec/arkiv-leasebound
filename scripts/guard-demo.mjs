// The guard: before an agent does anything, ask "is there a live lease, made by ME?"
// Use:  node scripts\guard-demo.mjs <leaseKey> "READ demo-file.txt"
import "dotenv/config";
import { createPublicClient, createWalletClient, NoEntityFoundError } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { u64 } from "@arkiv-network/sdk/attr";
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const leaseKey = process.argv[2];
const action = process.argv[3] ?? "READ demo-file.txt";
if (!leaseKey) {
  console.log('Use: node scripts\\guard-demo.mjs <leaseKey> "READ demo-file.txt"');
  process.exit(1);
}

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const publicClient = createPublicClient({ chain: tiramisu, transport: http() });
const client = createWalletClient({ chain: tiramisu, transport: http(), account });

// Rule: if anything is wrong or unclear, the answer is BLOCKED (fail closed).
async function checkLease(key, nowBlock) {
  try {
    const lease = await publicClient.getEntity(key);
    // Only trust leases that WE created. A stranger can make a fake lease note.
    if (lease.creator.toLowerCase() !== account.address.toLowerCase()) {
      return { result: "BLOCKED", reason: "WRONG_CREATOR" };
    }
    if (lease.expiresAt <= nowBlock) {
      return { result: "BLOCKED", reason: "EXPIRED" };
    }
    return { result: "ALLOWED", reason: "LEASE_ACTIVE" };
  } catch (e) {
    if (e instanceof NoEntityFoundError) {
      // Arkiv has no live entity with this key: it never existed, or it expired.
      return { result: "BLOCKED", reason: "NO_LIVE_LEASE" };
    }
    console.log("Could not check the lease:", e.shortMessage ?? e.message);
    return { result: "BLOCKED", reason: "CHECK_FAILED" };
  }
}

const nowBlock = await publicClient.getBlockNumber();
const { result, reason } = await checkLease(leaseKey, nowBlock);
console.log(`${action} -> ${result} (${reason})`);

const { entityKey, txHash } = await client.createEntity({
  payload: jsonToPayload({ action, result, reason, time: new Date().toISOString() }),
  contentType: "application/json",
  attributes: { type: "audit", lease: leaseKey, result, reason, block: u64(nowBlock) },
  expires: ExpirationTime.fromDays(30),
});
console.log("Audit note saved on Arkiv:", entityKey);
console.log("Transaction:", txHash);
