// The stop button: the owner removes a lease at once. A program running under leash is stopped
// within about 15 seconds, and a new program will not start.
// Use:  node scripts/revoke.mjs <leaseKey>
import "dotenv/config";
import { createPublicClient, createWalletClient, NoEntityFoundError } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { u64 } from "@arkiv-network/sdk/attr";
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { writeAuditNote } from "./notes.mjs";

// ----- colours (turn them off by typing:  set NO_COLOR=1 ) -----
const useColor = (process.stdout.isTTY || process.env.FORCE_COLOR) && !process.env.NO_COLOR;
const paint = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const red = paint("1;31");
const dim = paint("2");

const leaseKey = process.argv[2];
if (!leaseKey) {
  console.log("Use: node scripts/revoke.mjs <leaseKey>");
  process.exit(1);
}

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const publicClient = createPublicClient({ chain: tiramisu, transport: http() });
const client = createWalletClient({ chain: tiramisu, transport: http(), account });

try {
  const lease = await publicClient.getEntity(leaseKey);
  if (lease.creator.toLowerCase() !== account.address.toLowerCase()) {
    console.log("This lease was not made by our wallet, so we will not touch it.");
    process.exit(1);
  }
} catch (e) {
  if (e instanceof NoEntityFoundError) {
    console.log("There is no live lease with this key. Nothing to revoke.");
    process.exit(0);
  }
  console.log("Could not check the lease:", e.shortMessage ?? e.message);
  process.exit(1);
}

const del = await client.deleteEntity({ entityKey: leaseKey });
console.log(red("Lease REVOKED."), dim(`tx ${del.txHash}`));

const note = await writeAuditNote({
  client,
  publicClient,
  leaseKey,
  action: "REVOKE lease (stop button)",
  result: "BLOCKED",
  reason: "LEASE_REVOKED",
});
console.log(dim(`audit note ${note.entityKey}`));
console.log(dim(`tx         ${note.txHash}`));
