import { createPublicClient, NoEntityFoundError } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { eq } from "@arkiv-network/sdk/query";
import { http } from "viem";

// The only wallet we trust. Notes made by other wallets are ignored.
const TRUSTED = "0x0A4aA86B07dB12093053a79714c7FC37DF0E27CF";
const REFRESH_MS = 8000;

const client = createPublicClient({ chain: tiramisu, transport: http() });

const $ = (id) => document.getElementById(id);
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
    const lease = await client.getEntity(key);
    if (lease.creator.toLowerCase() !== TRUSTED.toLowerCase()) {
      return { cls: "BLOCKED", text: "BLOCKED: this lease was not made by our wallet (fake lease)." };
    }
    const now = await client.getBlockNumber();
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
async function loadAudit() {
  const status = $("status");
  try {
    const result = await client
      .select({ key: true, createdAt: true, attributes: true, payload: true })
      .where(eq("type", "audit"))
      .createdBy(TRUSTED)
      .limit(100)
      .fetch();

    // The query has no sort option, so we sort here: newest first.
    const items = [...result.entities].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const rows = $("rows");
    rows.replaceChildren();
    for (const e of items) {
      const p = readPayload(e.payload);
      const answer = attr(e.attributes, "result") ?? p.result ?? "";
      const tr = document.createElement("tr");
      if (answer === "BLOCKED") tr.className = "blocked";

      const cells = [
        String(e.createdAt ?? ""),
        p.action ?? "",
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
    status.textContent = items.length
      ? `${items.length} note(s). Updated ${new Date().toLocaleTimeString()}.`
      : "No audit notes yet.";
  } catch (e) {
    status.textContent = `Could not load notes: ${e.shortMessage ?? e.message}`;
  }
}

loadAudit();
setInterval(loadAudit, REFRESH_MS);