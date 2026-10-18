# Friction report

This is what got in my way while building on Arkiv. I am a beginner, and this is my first Arkiv project.
I only wrote things that really happened to me. Every number below comes from a run I did myself.

**My setup:** Windows 10, Node v20.11.1, npm 10.2.4, `@arkiv-network/sdk` 0.8.x (the exact number is shown by `npm ls @arkiv-network/sdk`), viem 2.57.7, Tiramisu testnet.

## Problems

### 1. A query with a plain number silently finds nothing (SDK, `gte` on a `u64` attribute)

- **I expected:** `gte("block", 734000)` to find the same notes as `gte("block", u64(734000n))`, or to tell me the types do not match.
- **What happened:** my audit notes store `block` as a `u64`. A query with `u64(...)` found **8** notes. The same query with the plain number `734000` found **0** notes, and gave no error. A plain JavaScript number becomes an `i32` in a query, and an `i32` did not match my `u64` attribute. I only found out because I ran both versions side by side.
- **Steps to repeat:**
  1. Write some entities with an attribute `block: u64(<a block number>)`.
  2. Run `node scripts/friction-probe.mjs` from my repo. It runs three queries for my wallet: A) `type = audit` (31 notes), B) `... AND block >= u64(734000)` (8 notes), C) `... AND block >= 734000` (0 notes).
- **Why it matters:** in a security tool, "no results" looks the same as "nothing happened". A wrong number type makes the audit diary look empty.
- **What would fix it:** return an error when the value's type does not match the stored attribute type, or say so in the docs next to range queries.

### 2. A wallet with no tokens gives a confusing error (SDK, `createEntity`)

- **I expected:** a clear message like "not enough funds".
- **What happened:** `createEntity` stopped with `EntityMutationError: Transaction failed: Execution error without revert data`. Deeper in the log it said `out of gas: gas required exceeds: 0` on `eth_estimateGas`. Nothing said the wallet was empty. This happened with two different wallets (my first wallet, and a throw-away test wallet, `0xdA0864eBA0Af7869118F2BA82F042b09999EBf8f`).
- **Steps to repeat:**
  1. Make a new wallet with a random private key. Do not put any tokens in it.
  2. Run `createEntity` on `tiramisu`, for example `node scripts/lease-create.mjs 150 --allow node`.
  3. You see the error above.
- **How I got past it:** I got test tokens for my first wallet from the faucet, and the same script worked.
- **What would fix it:** check the balance before sending, and say "this wallet has 0 tokens, get some from the faucet".

### 3. The faucet asked me to connect a browser wallet (Arkiv Hub, faucet page)

- **I expected:** a way to get tokens for a wallet I made in a script (for example, paste the address).
- **What happened:** `hub.arkiv.network/faucet` opened a "Connect a wallet" window (Rainbow, Base, MetaMask, WalletConnect). I had no browser wallet, so I installed MetaMask and put my script wallet's key into it. I did not see an address-only option, but it may exist and I may have missed it.
- **Steps to repeat:** open `https://hub.arkiv.network/faucet` in a browser that has no wallet extension.
- **What would fix it:** say clearly on the page how a script-only builder can get tokens.

### 4. The README shows only one way to set an expiry (`ExpirationTime`)

- **I expected:** the README to list the ways to set how long an entity lives.
- **What happened:** the README example only uses `ExpirationTime.fromDays(30)`. I needed 10 minutes, then 60 seconds. I found `fromSeconds`, `fromMinutes`, `fromHours` and `fromBlocks` only by searching the type files in `node_modules/@arkiv-network/sdk/dist/*.d.ts`.
- **Steps to repeat:** open the SDK README and search for `fromMinutes`. It is not there.
- **What would fix it:** one line in the README that lists all the `ExpirationTime` helpers.

## Things that worked (I tested them)

- **`createEntity` with attributes and an expiry** on Tiramisu. It worked many times.
- **Expiry is exact in my test.** I made a lease that lives 60 seconds (30 blocks, `createdAt` 725926, `expiresAt` 725956) and asked Arkiv about it every 4 seconds (`scripts/expiry-test.mjs`). It was still returned at block 725953. At block 725956, which is exactly `expiresAt`, `getEntity` threw `NoEntityFoundError`. It was never returned at or after `expiresAt`. I asked about every 2 blocks, so I cannot say anything about the blocks in between. I ran it once.
- **`deleteEntity` is seen quickly.** After the owner deleted a lease, `getEntity` stopped finding it. In two runs, the next note about it came 1 and 2 blocks after the note about the delete.
- **A compound query with a number range works** when the value has the right type: `type = "audit" AND block >= u64(734000)` with `createdBy(wallet)` found 8 notes.
- **`createdBy(...)`** found only the notes made by my wallet (31 audit notes).
- **A plain JSON-RPC call to `arkiv_query`, with no SDK,** worked. `scripts/read-audit.mjs` read the same 31 notes with only `fetch`.

## What I did not test

I did not test request limits, WebSocket events, batch writes, or extending a lease. I used none of them.
