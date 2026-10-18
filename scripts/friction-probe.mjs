// Asks Arkiv the same kind of question three ways, to see how number types behave in a query.
// Use:  node scripts/friction-probe.mjs                 (our wallet, blocks from 734000)
//       node scripts/friction-probe.mjs <wallet> <fromBlock>
// Our audit notes store the block number as a u64. A plain JavaScript number in a query becomes an i32.
import { createPublicClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { u64 } from "@arkiv-network/sdk/attr";
import { and, eq, gte } from "@arkiv-network/sdk/query";
import { http } from "viem";

const wallet = process.argv[2] ?? "0x0A4aA86B07dB12093053a79714c7FC37DF0E27CF";
const from = Number(process.argv[3] ?? 734000);
const client = createPublicClient({ chain: tiramisu, transport: http() });

async function count(label, predicate) {
  try {
    const r = await client.select({ key: true }).where(predicate).createdBy(wallet).limit(100).fetch();
    console.log(`${label}: ${r.entities.length} note(s)`);
  } catch (e) {
    console.log(`${label}: ERROR ${e.name}: ${e.shortMessage ?? e.message}`);
  }
}

console.log(`Wallet ${wallet}, from block ${from}\n`);
await count("A) all audit notes                          ", eq("type", "audit"));
await count(`B) block >= u64(${from})                  `, and(eq("type", "audit"), gte("block", u64(BigInt(from)))));
await count(`C) block >= ${from} (plain number, i32)    `, and(eq("type", "audit"), gte("block", from)));
console.log("\nIf B and C give different numbers (or C gives an error), the number type matters in a query.");
