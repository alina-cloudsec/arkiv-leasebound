// leash: runs ANY program, but only while a lease is alive. When the lease ends, the program is stopped.
// Use:  node scripts/leash.mjs <leaseKey> -- <command> [arguments]
// Example: node scripts/leash.mjs 0xabc... -- node scripts/demo-agent.mjs
import "dotenv/config";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createPublicClient, createWalletClient, NoEntityFoundError } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { u64 } from "@arkiv-network/sdk/attr";
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ----- colours (turn them off by typing:  set NO_COLOR=1 ) -----
const useColor = (process.stdout.isTTY || process.env.FORCE_COLOR) && !process.env.NO_COLOR;
const paint = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = paint("1;32");
const red = paint("1;31");
const cyan = paint("36");
const dim = paint("2");
const badge = (result) => (result === "ALLOWED" ? paint("1;97;42")(" ALLOWED ") : paint("1;97;41")(" BLOCKED "));
const TAG = cyan("[leash]");

// Runs the command and watches the clock. Stops the command when the lease ends.
// (Kept separate from Arkiv so it can be tested on its own.)
export function runLeashed({
  command,
  args,
  deadlineBlock,
  getBlock,
  leaseExists,
  pollMs = 5000,
  fullCheckEvery = 12, // every 12th check (about 1 minute) we also ask Arkiv if the lease still exists
  maxFailures = 3,
}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit" });
    let killing = null;
    let ticks = 0;
    let failures = 0;
    let busy = false;

    const kill = (reason) => {
      if (killing) return;
      killing = reason;
      child.kill();
      setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 3000).unref();
    };

    const timer = setInterval(async () => {
      if (killing || busy) return;
      busy = true;
      ticks++;
      try {
        const now = await getBlock();
        failures = 0;
        if (now >= deadlineBlock) {
          kill("COMMAND_KILLED_LEASE_ENDED");
        } else if (ticks % fullCheckEvery === 0 && !(await leaseExists())) {
          kill("COMMAND_KILLED_LEASE_GONE");
        }
      } catch {
        failures++;
        // If we cannot check the lease, we stop the command. Safe side first.
        if (failures >= maxFailures) kill("COMMAND_KILLED_CANNOT_CHECK_LEASE");
      } finally {
        busy = false;
      }
    }, pollMs);

    child.on("error", (e) => {
      clearInterval(timer);
      resolve({ outcome: "ERROR", reason: "COMMAND_COULD_NOT_START", detail: e.message });
    });
    child.on("exit", (code) => {
      clearInterval(timer);
      if (killing) resolve({ outcome: "KILLED", reason: killing, exitCode: code });
      else resolve({ outcome: "FINISHED", reason: "COMMAND_FINISHED", exitCode: code });
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const sep = argv.indexOf("--");
  if (argv.length < 3 || sep !== 1) {
    console.log("Use: node scripts/leash.mjs <leaseKey> -- <command> [arguments]");
    console.log("Example: node scripts/leash.mjs 0xabc... -- node scripts/demo-agent.mjs");
    process.exit(1);
  }
  const leaseKey = argv[0];
  const [command, ...cmdArgs] = argv.slice(sep + 1);
  const action = `RUN ${[command, ...cmdArgs].join(" ")}`.slice(0, 120);

  const account = privateKeyToAccount(process.env.PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: tiramisu, transport: http() });
  const client = createWalletClient({ chain: tiramisu, transport: http(), account });

  async function writeAudit(result, reason) {
    const block = await publicClient.getBlockNumber();
    const { entityKey, txHash } = await client.createEntity({
      payload: jsonToPayload({ action, result, reason, time: new Date().toISOString() }),
      contentType: "application/json",
      attributes: { type: "audit", lease: leaseKey, result, reason, block: u64(block) },
      expires: ExpirationTime.fromDays(30),
    });
    console.log(`${TAG} audit note: ${badge(result)} ${reason}`);
    console.log(dim(`        note ${entityKey}`));
    console.log(dim(`        tx   ${txHash}`));
  }

  // Step 1: is there a live lease, made by us?
  const nowBlock = await publicClient.getBlockNumber();
  let lease;
  let refuse = null;
  try {
    lease = await publicClient.getEntity(leaseKey);
    if (lease.creator.toLowerCase() !== account.address.toLowerCase()) refuse = "WRONG_CREATOR";
    else if (lease.expiresAt <= nowBlock) refuse = "EXPIRED";
  } catch (e) {
    refuse = e instanceof NoEntityFoundError ? "NO_LIVE_LEASE" : "CHECK_FAILED";
    if (refuse === "CHECK_FAILED") console.log(`${TAG} could not check the lease:`, e.shortMessage ?? e.message);
  }
  if (refuse) {
    console.log(`${TAG} ${red("NOT starting the command:")} ${badge("BLOCKED")} ${refuse}`);
    await writeAudit("BLOCKED", refuse);
    process.exit(1);
  }

  // Step 2: run the command, and stop it when the lease ends.
  console.log(`${TAG} ${green("lease is alive")} (ends at block ${lease.expiresAt}, now ${nowBlock}). Starting: ${action}`);
  await writeAudit("ALLOWED", "COMMAND_STARTED");

  const result = await runLeashed({
    command,
    args: cmdArgs,
    deadlineBlock: lease.expiresAt,
    getBlock: () => publicClient.getBlockNumber(),
    leaseExists: async () => {
      try {
        await publicClient.getEntity(leaseKey);
        return true;
      } catch (e) {
        if (e instanceof NoEntityFoundError) return false;
        throw e;
      }
    },
  });

  if (result.outcome === "ERROR") {
    console.log(`${TAG} the command could not start:`, result.detail);
    process.exit(1);
  }
  if (result.outcome === "KILLED") {
    console.log(`${TAG} ${red("the lease ended, so the command was STOPPED")} (${result.reason}).`);
    await writeAudit("BLOCKED", result.reason);
  } else {
    console.log(`${TAG} the command finished by itself (exit code ${result.exitCode}).`);
    await writeAudit("ALLOWED", result.reason);
  }
}

// Run main() only when this file is started directly (not when a test imports it).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`${TAG} error:`, e.shortMessage ?? e.message);
    process.exit(1);
  });
}