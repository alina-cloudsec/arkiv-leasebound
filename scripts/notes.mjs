// Writes one audit note to Arkiv in "privacy mode".
// On Arkiv we put only a SALTED HASH of the action text (for example the command line).
// The real text and the salt stay on this computer, in the file private-log.jsonl (never put it on GitHub).
// Later the owner can show the text and the salt to an auditor, who can check them against the hash.
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { u64 } from "@arkiv-network/sdk/attr";
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils";

// The recipe is public: sha256( salt + ":" + action ), written in lower case hex.
export function hashAction(action, salt) {
  return createHash("sha256").update(`${salt}:${action}`).digest("hex");
}

export async function writeAuditNote({ client, publicClient, leaseKey, action, result, reason, privateLogPath = "private-log.jsonl" }) {
  const block = await publicClient.getBlockNumber();
  const salt = randomBytes(16).toString("hex"); // a new salt for every note
  const actionHash = hashAction(action, salt);
  const time = new Date().toISOString();

  const { entityKey, txHash } = await client.createEntity({
    payload: jsonToPayload({ actionHash, result, reason, time, privacy: "salted-sha256" }),
    contentType: "application/json",
    attributes: { type: "audit", lease: leaseKey, result, reason, block: u64(block) },
    expires: ExpirationTime.fromDays(30),
  });

  // The private copy: only on this computer.
  appendFileSync(
    privateLogPath,
    JSON.stringify({ noteKey: entityKey, txHash, action, salt, actionHash, result, reason, time }) + "\n"
  );
  return { entityKey, txHash, actionHash };
}

