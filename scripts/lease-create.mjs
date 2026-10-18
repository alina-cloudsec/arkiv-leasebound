// Makes a lease on Arkiv. It lives for 10 minutes, or for the number of seconds you type.
// Use:  node scripts/lease-create.mjs                      (10 minutes, any program may run)
//       node scripts/lease-create.mjs 90                   (90 seconds, good for a short demo)
//       node scripts/lease-create.mjs 90 --allow node      (only the program "node" may run)
//       node scripts/lease-create.mjs 90 --allow node,git  (a list is fine too)
import "dotenv/config";
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ----- colours (turn them off by typing:  set NO_COLOR=1 ) -----
const useColor = (process.stdout.isTTY || process.env.FORCE_COLOR) && !process.env.NO_COLOR;
const paint = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = paint("1;32");
const cyan = paint("36");
const dim = paint("2");

const args = process.argv.slice(2);
const allowAt = args.indexOf("--allow");
let allow;
if (allowAt !== -1) {
  allow = (args[allowAt + 1] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (allow.length === 0) {
    console.log("After --allow, type the program names. Example: node scripts/lease-create.mjs 90 --allow node");
    process.exit(1);
  }
}
const plain = args.filter((_, i) => i !== allowAt && i !== allowAt + 1);
const seconds = Number(plain[0] ?? 600);
if (!Number.isInteger(seconds) || seconds < 10 || seconds > 86400) {
  console.log("Please type a whole number of seconds between 10 and 86400. Example: node scripts/lease-create.mjs 90");
  process.exit(1);
}

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const client = createWalletClient({ chain: tiramisu, transport: http(), account });
const publicClient = createPublicClient({ chain: tiramisu, transport: http() });

const { entityKey, txHash } = await client.createEntity({
  payload: jsonToPayload({
    agent: "demo-agent-1",
    permission: "read-demo-file (synthetic data only)",
    ...(allow ? { allow } : {}),
  }),
  contentType: "application/json",
  attributes: { type: "lease", agent: "demo-agent-1" },
  expires: ExpirationTime.fromSeconds(seconds),
});

console.log(green(`Lease created (lives ${seconds} seconds)`));
console.log("Programs allowed:", allow ? allow.join(", ") : "any (no list)");
console.log("Key:        ", cyan(entityKey));
console.log(dim(`Transaction: ${txHash}`));
const lease = await publicClient.getEntity(entityKey);
console.log(`Starts at block ${lease.createdAt}, ends at block ${lease.expiresAt}.`);
console.log(`\nNext, run:\n  node scripts/leash.mjs ${entityKey} -- node scripts/demo-agent.mjs`);
