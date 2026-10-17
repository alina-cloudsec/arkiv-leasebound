import "dotenv/config";
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const client = createWalletClient({ chain: tiramisu, transport: http(), account });
const publicClient = createPublicClient({ chain: tiramisu, transport: http() });

const { entityKey, txHash } = await client.createEntity({
  payload: jsonToPayload({
    agent: "demo-agent-1",
    permission: "read-demo-file (synthetic data only)",
  }),
  contentType: "application/json",
  attributes: { type: "lease", agent: "demo-agent-1" },
  expires: ExpirationTime.fromMinutes(10),
});

console.log("Lease created:", entityKey);
console.log("Transaction:", txHash);
console.log(await publicClient.getEntity(entityKey));