import { createPublicClient, NoEntityFoundError } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { and, eq, gte } from "@arkiv-network/sdk/query";
import { u64 } from "@arkiv-network/sdk/attr";
import { http } from "viem";

// The only wallet we trust. Notes made by other wallets are ignored.
const TRUSTED = "0x0A4aA86B07dB12093053a79714c7FC37DF0E27CF";

const client = createPublicClient({ chain: tiramisu, transport: http() });

const $ = (id) => document.getElementById(id);

// If the public server is busy, the SDK can wait for a very long time without any message.
// So we stop waiting after 20 seconds and tell the person what happened.
const withTimeout = (promise, ms = 20000) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Arkiv did not answer in time. The public server may be busy. Please try again in a few minutes.")),
        ms
      )
    ),
  ]);
$("trusted").textContent = TRUSTED;



// Attributes can come back as { type, value } or as a plain value. Handle both.
const attr = (attributes, name) => {
  const a = attributes?.[name];
  return a && typeof a === "object" && "value" in a ? a.value : a;
};

function readPayload(payload) {
  try {
    return JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return {};
  }
}

const short = (s) => (s && s.length > 14 ? `${s.slice(0, 8)}...${s.slice(-6)}` : s ?? "");

// ---------- 1. Check a lease ----------
async function checkLease(key) {
  try {
    const lease = await withTimeout(client.getEntity(key));
    if (lease.creator.toLowerCase() !== TRUSTED.toLowerCase()) {
      return { cls: "BLOCKED", text: "BLOCKED: this lease was not made by our wallet (fake lease)." };
    }
    const now = await withTimeout(client.getBlockNumber());
    if (lease.expiresAt <= now) {
      return { cls: "BLOCKED", text: "BLOCKED: this lease has expired." };
    }
    const blocksLeft = lease.expiresAt - now;
    return { cls: "ACTIVE", text: `ACTIVE: this lease is alive. It ends in about ${blocksLeft} blocks.` };
  } catch (e) {
    if (e instanceof NoEntityFoundError) {
      return { cls: "BLOCKED", text: "BLOCKED: there is no live lease with this key (it never existed, or it expired)." };
    }
    return { cls: "warn", text: `We could not check: ${e.shortMessage ?? e.message}` };
  }
}

$("checkBtn").addEventListener("click", async () => {
  const key = $("leaseKey").value.trim();
  const out = $("checkResult");
  out.className = "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    out.textContent = "A lease key starts with 0x and has 64 more letters or numbers.";
    return;
  }
  out.textContent = "Checking...";
  const r = await checkLease(key);
  out.className = r.cls;
  out.textContent = r.text;
});

// ---------- 2. Audit diary ----------
let loading = false;
let lastItems = [];
async function loadAudit() {
  if (loading) return;
  loading = true;
  const status = $("status");
  status.textContent = "Loading...";
  try {
    // Build the question from the two filters. Always: type = audit, and made by our wallet.
    const conditions = [eq("type", "audit")];
    const wanted = $("fResult").value;
    if (wanted) conditions.push(eq("result", wanted));
    const lastBlocks = Number($("fBlocks").value);
    if (Number.isInteger(lastBlocks) && lastBlocks > 0) {
      const nowBlock = await withTimeout(client.getBlockNumber());
      const from = nowBlock > BigInt(lastBlocks) ? nowBlock - BigInt(lastBlocks) : 0n;
      conditions.push(gte("block", u64(from)));
    }
    const result = await withTimeout(
      client
        .select({ key: true, createdAt: true, attributes: true, payload: true })
        .where(conditions.length === 1 ? conditions[0] : and(...conditions))
        .createdBy(TRUSTED)
        .limit(100)
        .fetch()
    );

    // The query has no sort option, so we sort here: newest first.
    const items = [...result.entities].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    lastItems = items;

    const rows = $("rows");
    rows.replaceChildren();
    for (const e of items) {
      const p = readPayload(e.payload);
      const answer = attr(e.attributes, "result") ?? p.result ?? "";
      const tr = document.createElement("tr");
      if (answer === "BLOCKED") tr.className = "blocked";

      const cells = [
        String(e.createdAt ?? ""),
        p.actionHash ? `\u{1F512} hash ${String(p.actionHash).slice(0, 12)}...` : p.action ?? "",
        answer,
        attr(e.attributes, "reason") ?? p.reason ?? "",
        short(attr(e.attributes, "lease")),
      ];
      cells.forEach((text, i) => {
        const td = document.createElement("td");
        if (i === 2) {
          const b = document.createElement("span");
          b.className = `badge ${answer}`;
          b.textContent = text;
          td.append(b);
        } else if (i === 4) {
          const c = document.createElement("code");
          c.textContent = text;
          td.append(c);
        } else {
          td.textContent = text;
        }
        tr.append(td);
      });
      rows.append(tr);
    }
    const answers = items.map((e) => attr(e.attributes, "result") ?? readPayload(e.payload).result ?? "");
    $("sAllowed").textContent = answers.filter((a) => a === "ALLOWED").length;
    $("sBlocked").textContent = answers.filter((a) => a === "BLOCKED").length;
    $("sTotal").textContent = items.length;
    status.textContent = items.length
      ? `${items.length} note(s). Updated ${new Date().toLocaleTimeString()}.`
      : "No audit notes yet.";
  } catch (e) {
    status.textContent = `Could not load notes: ${e.shortMessage ?? e.message}`;
  } finally {
    loading = false;
  }
}


// ---------- 3. Privacy check ----------
async function sha256Hex(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

$("vBtn").addEventListener("click", async () => {
  const action = $("vAction").value;
  const salt = $("vSalt").value.trim();
  const out = $("vResult");
  out.className = "";
  if (!action || !salt) {
    out.textContent = "Please fill both boxes: the text and the salt.";
    return;
  }
  const hash = await sha256Hex(`${salt}:${action}`);
  const match = lastItems.find((e) => readPayload(e.payload).actionHash === hash);
  if (match) {
    out.className = "ACTIVE";
    out.textContent = `MATCH: a note at block ${match.createdAt} (${attr(match.attributes, "result")}, ${attr(match.attributes, "reason")}) was written for exactly this text.`;
  } else {
    out.className = "warn";
    out.textContent = "No note on this page matches. The text and the salt must be exactly the same, and the note must be in the list above.";
  }
});

// ---------- 4. Read it without us ----------
(function showRawQuery() {
  const RPC = "https://rpc.tiramisu.db-chain.testnet.arkiv.network";
  const query = `type = str('audit') AND $creator = addr(${TRUSTED})`;
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "arkiv_query",
    params: [
      query,
      {
        select: { key: true, owner: false, creator: false, createdAt: true, updatedAt: false, expiresAt: false, creationFlags: false, contentType: false, payload: true, attributeSchema: false, attributes: true },
        limit: "0x64",
      },
    ],
  };
  // \u0027 is a single quote written in JSON, so the command also works inside single quotes in bash.
  const text = JSON.stringify(body).replace(/'/g, "\\u0027");
  $("rawQuery").textContent = query;
  $("rawCurl").textContent = `curl -s ${RPC} -H "content-type: application/json" -d '${text}'`;
})();

// No automatic timer. The public Arkiv server limits how often one visitor can ask,
// so we load once and then only when the person presses Refresh.
$("refreshBtn").addEventListener("click", loadAudit);
loadAudit();