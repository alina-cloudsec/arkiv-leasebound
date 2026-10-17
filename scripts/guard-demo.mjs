import "dotenv/config";
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const leaseKey = process.argv[2];
const action = process.argv[3] ?? "READ demo-file.txt";
if (!leaseKey) {
  console.log('Use: node guard-demo.mjs <leaseKey> "READ demo-file.txt"');
  process.exit(1);
}

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const publicClient = createPublicClient({ chain: tiramisu, transport: http() });
const client = createWalletClient({ chain: tiramisu, transport: http(), account });

async function leaseIsActive(key) {
  try {
    const lease = await publicClient.getEntity(key);
    const now = await publicClient.getBlockNumber();
    return lease.expiresAt > now;
  } catch {
    return false; // lease not found = it has expired and was removed
  }
}

const active = await leaseIsActive(leaseKey);
const result = active ? "ALLOWED" : "BLOCKED";
console.log(`${action} -> ${result}`);

const { entityKey } = await client.createEntity({
  payload: jsonToPayload({ action, result, time: new Date().toISOString() }),
  contentType: "application/json",
  attributes: { type: "audit", lease: leaseKey, result },
  expires: ExpirationTime.fromDays(30),
});
console.log("Audit log saved on Arkiv:", entityKey);