// Reads the audit notes of any wallet straight from the public Arkiv server.
// It uses NO Arkiv library and NO server of ours: only the public address of the Arkiv node.
// Use:  node scripts/read-audit.mjs <walletAddress>
const wallet = process.argv[2];
if (!/^0x[0-9a-fA-F]{40}$/.test(wallet ?? "")) {
  console.log("Use: node scripts/read-audit.mjs <walletAddress>");
  console.log("Example: node scripts/read-audit.mjs 0x0A4aA86B07dB12093053a79714c7FC37DF0E27CF");
  process.exit(1);
}
const RPC = process.env.ARKIV_RPC ?? "https://rpc.tiramisu.db-chain.testnet.arkiv.network";

const query = `type = str('audit') AND $creator = addr(${wallet})`;
const body = {
  jsonrpc: "2.0",
  id: 1,
  method: "arkiv_query",
  params: [
    query,
    {
      select: {
        key: true, owner: false, creator: false, createdAt: true, updatedAt: false, expiresAt: false,
        creationFlags: false, contentType: false, payload: true, attributeSchema: false, attributes: true,
      },
      limit: "0x64",
    },
  ],
};

const response = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const json = await response.json();
if (json.error) {
  console.log("The Arkiv server answered with an error:", json.error.message ?? JSON.stringify(json.error));
  process.exit(1);
}

const decode = (hex) => {
  try {
    return JSON.parse(Buffer.from(String(hex).replace(/^0x/, ""), "hex").toString("utf8"));
  } catch {
    return {};
  }
};

const rows = (json.result?.data ?? [])
  .map((e) => {
    const attrs = Object.fromEntries((e.attributes ?? []).map((a) => [a.name, a.value]));
    const p = decode(e.payload);
    return {
      createdAt: BigInt(e.createdAt ?? 0),
      result: attrs.result ?? p.result ?? "",
      reason: attrs.reason ?? p.reason ?? "",
      lease: String(attrs.lease ?? "").slice(0, 10) + "...",
      what: p.actionHash ? `hash ${String(p.actionHash).slice(0, 12)}...` : p.action ?? "",
    };
  })
  .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

console.log(`Query: ${query}`);
console.log(`Found ${rows.length} audit note(s) made by ${wallet}\n`);
for (const r of rows) {
  console.log(`block ${r.createdAt}  ${String(r.result).padEnd(8)} ${String(r.reason).padEnd(30)} lease ${r.lease}  ${r.what}`);
}
