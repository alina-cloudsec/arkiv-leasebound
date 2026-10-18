# Schema: what we save on Arkiv

This project saves three kinds of notes on Arkiv: a **permission slip** (lease), a **diary line** (audit), and a **test slip** (expiry-test).

- Network: Tiramisu testnet (chain ID 7738577)
- SDK: `@arkiv-network/sdk` 0.8.x
- All data is made up (synthetic). There are no real people, no keys and no secrets in it.

## Note type 1: `lease` (the permission slip)

A lease says: "This agent may work, with these programs, but only for a short time."

| Part | What we put there |
| --- | --- |
| Attribute `type` | `"lease"` (text) |
| Attribute `agent` | the agent's name, like `"demo-agent-1"` (text) |
| Payload (JSON) | `{ "agent": "...", "permission": "...", "allow": ["node"] }` |
| Content type | `application/json` |
| How long it lives | 10 minutes by default, or the seconds you type (we used 60, 90, 150 and 240). Set with `ExpirationTime.fromSeconds(...)` |
| Made by | `scripts/lease-create.mjs`, for example `node scripts/lease-create.mjs 90 --allow node` |

The `allow` list is optional. It holds the names of the programs the agent may run. If a lease has no list, any program may run.

**Why so short?** A permission slip should not live forever. When the time is over, Arkiv removes it by itself. No slip means no permission.

## Note type 2: `audit` (the diary line)

An audit note writes down what the guard or leash decided.

| Part | What we put there |
| --- | --- |
| Attribute `type` | `"audit"` (text) |
| Attribute `lease` | the key of the lease that was checked (text) |
| Attribute `result` | `"ALLOWED"` or `"BLOCKED"` (text) |
| Attribute `reason` | why (text, see the list below) |
| Attribute `block` | the block number when the note was written (a number, `u64`) |
| Payload (JSON) | `{ "actionHash": "...", "result": "...", "reason": "...", "time": "...", "privacy": "salted-sha256" }` |
| Content type | `application/json` |
| How long it lives | 30 days (`ExpirationTime.fromDays(30)`) |
| Made by | `scripts/notes.mjs`, called by `scripts/leash.mjs`, `scripts/revoke.mjs` and `scripts/guard-demo.mjs` |

**Why 30 days?** The diary line must live longer than the lease it talks about. If both disappeared together, the proof would disappear too.

**Privacy mode.** The payload holds `actionHash`, not the command text. The hash is `sha256` of `salt`, then `:`, then the text, written in lower case hex. Every note gets a new random salt. The text and the salt stay on the owner's computer, in the file `private-log.jsonl`. The owner can show the text and the salt to anyone, and that person can check them against the hash. The page has a "Privacy check" box for this.

**Older notes.** Notes made before we added privacy mode have `"action": "..."` (the plain command text) in the payload instead of `actionHash`. The page and `read-audit.mjs` show both kinds.

### Reasons we write

| Reason | Meaning | Seen on the real chain? |
| --- | --- | --- |
| `LEASE_ACTIVE` | guard check: the lease is alive | yes |
| `NO_LIVE_LEASE` | Arkiv has no live lease with this key (never existed, or it ended) | yes |
| `EXPIRED` | the lease was found, but its end block has passed | no |
| `WRONG_CREATOR` | the lease was not made by the wallet that runs the guard | printed in the terminal; the note could not be saved (that wallet had no tokens) |
| `CHECK_FAILED` | we could not ask Arkiv, so we say BLOCKED | no |
| `COMMAND_NOT_ALLOWED` | the lease has a program list, and the program is not on it | yes |
| `LEASE_REVOKED` | the owner pressed the stop button (`scripts/revoke.mjs`) | yes |
| `COMMAND_STARTED` | leash started a program | yes |
| `COMMAND_FINISHED` | the program ended by itself | yes |
| `COMMAND_KILLED_LEASE_ENDED` | leash stopped the program because the lease ended | yes |
| `COMMAND_KILLED_LEASE_GONE` | leash stopped the program because the lease was removed early | yes |
| `COMMAND_KILLED_CANNOT_CHECK_LEASE` | leash stopped the program because it could not check the lease | no (tested in code only) |

## Note type 3: `expiry-test`

A lease that lives 60 seconds. It is made only to measure how exactly expiry works.

| Part | What we put there |
| --- | --- |
| Attribute `type` | `"expiry-test"` (text) |
| Payload (JSON) | `{ "agent": "expiry-test", "permission": "none (synthetic test)" }` |
| How long it lives | 60 seconds (`ExpirationTime.fromSeconds(60)`) |
| Made by | `scripts/expiry-test.mjs` |

## The questions our app asks

**1. "Is this lease alive, and did we make it?"** (guard, leash, and the "Check a lease" box on the page)

`getEntity(leaseKey)`. If a live entity comes back, we check that its `creator` is our wallet, that its `expiresAt` is after the current block (`getBlockNumber()`), and, in leash, that the program is on its `allow` list. If Arkiv throws `NoEntityFoundError`, the answer is BLOCKED.

**2. "Show me the audit notes made by our wallet"** (the diary on the page, `web/src/main.js`)

```js
publicClient
  .select({ key: true, createdAt: true, attributes: true, payload: true })
  .where(eq("type", "audit"))
  .createdBy("0x0A4aA86B07dB12093053a79714c7FC37DF0E27CF")
  .limit(100)
  .fetch();
```

With the two filters on the page ("only BLOCKED" and "from the last N blocks"), the question gets more conditions, joined with `and(...)`. For example, "only BLOCKED, last 500 blocks" sends:

```
type = str('audit') AND result = str('BLOCKED') AND block >= u64(<current block - 500>) AND $creator = addr(0x0A4a...27CF)
```

Anyone can write a note called "audit", so we do not trust the name. We trust who made it (`createdBy`). The page sorts the result, newest first. Notes made before we added the `block` number do not match the block filter.

**3. The same question with no library** (`scripts/read-audit.mjs`, and the "Read it without us" box on the page)

A plain JSON-RPC call to the public Arkiv server:

```
method: arkiv_query
params: ["type = str('audit') AND $creator = addr(0x0A4a...27CF)", { "select": { ... }, "limit": "0x64" }]
```

**4. While a program runs under leash**

Every 5 seconds, leash compares the current block with the lease's end block. About every 15 seconds, it also asks Arkiv if the lease still exists. This is how a revoke is found.

## Our wallet

| Address | What it does |
| --- | --- |
| `0x0A4aA86B07dB12093053a79714c7FC37DF0E27CF` | Makes all the `lease`, `audit` and `expiry-test` notes (one wallet in this first version) |

## Examples on Tiramisu

Leases end quickly, so check the transactions on the explorer (tiramisu.explorer.arkiv.network). Search our wallet address.

| What | Key or transaction |
| --- | --- |
| Lease, 150 seconds, only `node` allowed | key `0x47c64036851e21d1961f09076a42342e5b4ac97dc7fc2faf77426bf6abfd3634`, tx `0xbd5dc07c4df00db217c2ac369279f4828f604be6ac5c3432673abb085656cce6` |
| Leash start, ALLOWED (`COMMAND_STARTED`), hash only | note `0x6ff41ac0a73dd3a3016eaf115a9a2a2a313c4e4136c3d4fba466c5a7e715e138`, tx `0x9b537189306331b3ced557670ebff31606d02469feb218bfacc4e61f98327a1a` |
| Leash end, ALLOWED (`COMMAND_FINISHED`), hash only | note `0xbc48523f5834b1139fae2bd3746f3057bf87724f910b0745deed327f018d60f6`, tx `0xcf3ab1af473098373e300999635c6e3d1c6d19952ad5dd7c32c12c69941b416d` |
| Lease, 150 seconds | key `0x13ac4bd6a532c907f3d5674c563a5254e8f577eb290d78c7d1603508e404da16`, tx `0xad1c69471d8e6c572c88beda06b1cc72beaf980ae2f9527f0e020675e94c5d02` |
| Leash stops the agent, BLOCKED (`COMMAND_KILLED_LEASE_ENDED`), older note with plain text | tx `0xca9e7a4005a48ce3de4692703763e8a7ff36ba8ca9e144afc329ecb2be656cd5` |
| Leash refuses to start, BLOCKED (`NO_LIVE_LEASE`), older note with plain text | tx `0x584cf8f51f02e68008d3c3745d314bb1239abb6e1ae2c2e9c294c8207fb581d1` |
| Lease, 90 seconds | key `0xfcebfd87a401ba5b0d5eed33da6cc5f2a2ce16cbdb094515d326f09658f88dbf`, tx `0xdaf61069a100bf094bea21112a9b7307e4f44180fd6c44465f98b4e5eba25b2b` |
| Expiry test lease, 60 seconds | key `0xfd250865adc54851d92c1ce76dbf9a1e6e470dd37bc72a481c2c0e56bbcdc695` |

## Honest limits

- The guard, leash and the page reject leases that were not made by the checking wallet. We saw this once in the terminal (`WRONG_CREATOR`), using a throw-away wallet as the checker. We did not test a second funded wallet that made a fake lease.
- Only the owner wallet can change or delete a note. One wallet makes everything here, so whoever holds its key could change the leases and the diary.
- Leash checks which **program** may run (the `allow` list). It does not check what that program does. If you allow `node`, node can do anything node can do.
- Leash does not pass secrets from its own environment (names with PRIVATE_KEY, SECRET, TOKEN, PASSWORD or API_KEY) to the program. It cannot protect secrets that are saved in files the program can read.
- Leash finds a revoke or an end of lease within about 15 seconds, not instantly.
- The lease key, the answer, the reason, the time and the block number are public. Only the command text is hidden.
- Audit notes disappear after 30 days. After that, the proof is the creation transactions on the explorer.
