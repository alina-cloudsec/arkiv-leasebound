import { appendFileSync } from "node:fs";
import { u64 } from "@arkiv-network/sdk/attr";
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils";
import { sha256 } from "viem";

// Safely hashes the action text to prevent exposing raw data on-chain if needed
export function hashAction(actionText) {
  return sha256(new TextEncoder().encode(actionText));
}

export async function writeAuditNote({ client, publicClient, leaseKey, action, result, reason }) {
  const block = await publicClient.getBlockNumber();
  const actionHash = hashAction(action);
  
  // 1. Save on Arkiv Chain (Public compliance data)
  const { entityKey, txHash } = await client.createEntity({
    payload: jsonToPayload({ action, result, reason, time: new Date().toISOString() }),
    contentType: "application/json",
    attributes: { 
      type: "audit", 
      lease: leaseKey, 
      result, 
      reason, 
      block: u64(block) 
    },
    expires: ExpirationTime.fromDays(30),
  });

  // 2. Save locally in a private log file (Full details)
  const logLine = JSON.stringify({
    entityKey,
    txHash,
    block: block.toString(),
    action,
    actionHash,
    result,
    reason,
    timestamp: new Date().toISOString()
  });
  appendFileSync("private-log.jsonl", logLine + "\n");

  return { entityKey, txHash, actionHash };
}
