# arkiv-leasebound

Give an AI agent permission for only a few minutes. When the time is up, the agent is stopped, and everything it did is saved.

Built for the Arkiv Global Tour Stop (9 to 18 October 2026, on the road to Devcon 8 Mumbai).

| | |
| --- | --- |
| Live page | https://alina-cloudsec.github.io/arkiv-leasebound/ |
| Demo video | https://youtu.be/OgjpOkK_VtU |
| Network | Arkiv Tiramisu testnet (chain ID 7738577) |
| Tracks | Security, Censorship Resistance, Privacy, Open Source |
| Our wallet | `0x0A4aA86B07dB12093053a79714c7FC37DF0E27CF` |
| License | MIT |

## What it does

- You make a **lease**. A lease is a small note on Arkiv. It says which agent may work, which programs it may run, and for how many seconds.
- A tool called **leash** starts the agent's program. It starts the program only if the lease is alive, was made by our wallet, and lists that program.
- While the program runs, **leash** watches the clock. When the lease ends, leash stops the program.
- You can press the **stop button** (`revoke`). The lease is removed, and leash stops the program within about 15 seconds.
- Every decision is saved as a **diary note** on Arkiv. The note holds only a hash of the command, not the command itself.
- A **web page** shows the diary. You can also read the diary without our page.

## The problem

On 25 April 2026, an AI coding agent (a Cursor agent running Anthropic's Claude Opus 4.6, says the report) deleted the live database of a company called PocketOS, and its backups, in 9 seconds. According to a report by Zenity, the agent was doing a small job in a test setup. It found a key in a file that had nothing to do with its job. That key was made only to manage web domains, but it could do almost anything, including deleting data. Nothing asked a human before the deletion.

Source: Zenity, "System Prompts Are Not Security Controls" (https://zenity.io/blog/ai-agent-database-deletion-pocketos).

The same report lists some simple ideas: an agent should not keep wide permission for a long time, it should get access only for the task, access should be taken back when the task is done, and the record of what happened should be kept outside the agent.

Leasebound follows those ideas in a small way:

- **Short time.** The permission ends by itself.
- **Narrow scope.** The lease lists the programs that may run.
- **A record outside the agent.** The diary lives on Arkiv, not on the agent's computer.

What Leasebound does **not** fix: in the PocketOS story, the agent found a key lying in a file. Leash cannot stop a program from reading files. See "Honest limits" below.

## How it works

```
You make a LEASE on Arkiv  (time limit + list of allowed programs)
        |
        v
LEASH starts the agent's program only if:
   1. a live lease exists,
   2. the lease was made by our wallet,
   3. the program is on the lease's list.
        |
        |-- yes: the program runs. Leash checks the clock every 5 seconds,
        |        and asks Arkiv about the lease about every 15 seconds.
        |        If the lease ends or is removed, the program is stopped.
        |-- no:  the program does not start.
        v
Every decision becomes a DIARY note on Arkiv (a hash of the command, never the command).
        |
        v
Anyone can read the diary: the web page, `read-audit.mjs`, or a plain query.
```

Two more things leash does:

- It does **not** pass our secrets to the program. Any environment variable with PRIVATE_KEY, SECRET, TOKEN, PASSWORD or API_KEY in its name is removed.
- The command text stays on your computer in `private-log.jsonl`. Arkiv only gets a salted hash.

## What is in this repo

| File | What it does |
| --- | --- |
| `scripts/gen-wallet.mjs` | Makes a new test wallet and saves its key in `.env` |
| `scripts/lease-create.mjs` | Makes a lease (time, and optional list of allowed programs) |
| `scripts/leash.mjs` | Runs a program under a lease, and stops it when the lease ends |
| `scripts/revoke.mjs` | The stop button: removes a lease at once |
| `scripts/guard-demo.mjs` | The simple guard: one question, one answer, one diary note |
| `scripts/notes.mjs` | Writes diary notes in privacy mode (salted hash) |
| `scripts/read-audit.mjs` | Reads the diary of any wallet straight from the public Arkiv server, with no library |
| `scripts/demo-agent.mjs` | A pretend agent that keeps working until it is stopped |
| `scripts/expiry-test.mjs` | Measures how exactly a lease ends |
| `scripts/friction-probe.mjs` | Asks Arkiv the same question three ways (see `arkiv/friction.md`) |
| `web/` | The web page (Vite). The `.github/workflows` file puts it online |
| `arkiv/schema.md` | Exactly what we save on Arkiv |
| `arkiv/friction.md` | The problems we hit while building with Arkiv |

## Try it yourself

You need: Node.js 20 or newer, git, a browser, and about 20 minutes. The commands below are for Windows Command Prompt. On Mac or Linux they are almost the same (see the notes).

**Step 1. Get the code**

```
git clone https://github.com/alina-cloudsec/arkiv-leasebound
cd arkiv-leasebound
npm install
```

**Step 2. Make a test wallet**

```
node scripts/gen-wallet.mjs
```

It prints your public address. It also saves the secret key in a file called `.env`. That file never goes to GitHub. Never share it. Use this wallet only for testing.

**Step 3. Get test tokens**

Open https://hub.arkiv.network/faucet and ask for tokens for your address. The faucet asks you to connect a browser wallet. We installed MetaMask and imported our test wallet's key into it. Without tokens, the next step fails with the error `out of gas: gas required exceeds: 0`.

**Step 4. Make a lease**

```
node scripts/lease-create.mjs 150 --allow node
```

This makes a lease that lives 150 seconds and allows only the program `node`. It prints a `Key:`. Copy it. Below, we call it `KEY`. (A lease lives 10 minutes if you do not type a number of seconds. If you leave out `--allow`, any program may run.)

**Step 5. Run the pretend agent under leash**

```
node scripts/leash.mjs KEY -- node scripts/demo-agent.mjs
```

You will see `[agent] did step 1`, `step 2`, and so on. When the lease ends, you will see `the lease ended, so the command was STOPPED`. Run the same command again. The agent does not start. You will see `BLOCKED NO_LIVE_LEASE`.

**Step 6. Try a program that is not allowed**

Make a new lease (step 4), then:

```
node scripts/leash.mjs KEY -- cmd /c echo hello
```

You will see `BLOCKED COMMAND_NOT_ALLOWED`. (On Mac or Linux use `-- echo hello`.)

**Step 7. Check that secrets are not passed on**

```
node scripts/leash.mjs KEY -- node -e "console.log('my key is:', process.env.PRIVATE_KEY)"
```

You will see `my key is: undefined`.

**Step 8. Press the stop button**

Open two Command Prompt windows in the repo folder. In window A, run step 5 with a new lease. While the agent works, run this in window B:

```
node scripts/revoke.mjs KEY
```

Within about 15 seconds, window A shows that the command was stopped (`COMMAND_KILLED_LEASE_GONE`).

**Step 9. Read the diary without our page**

```
node scripts/read-audit.mjs 0x0A4aA86B07dB12093053a79714c7FC37DF0E27CF
```

Use your own address to read your own notes. This script uses no Arkiv library. It asks the public Arkiv server directly.

**Step 10. Check a private command**

Our diary notes hold only a hash. To prove a note belongs to a command, show the last line of your private log:

```
powershell -c "Get-Content private-log.jsonl -Tail 1"
```

(On Mac or Linux: `tail -n 1 private-log.jsonl`.) Copy the `action` and the `salt` into the "Privacy check" box on the web page. It says `MATCH` if a note was written for exactly that text. The recipe is public: `sha256` of `salt`, then `:`, then the text.

**Step 11. The web page**

Use the live page, or run it on your computer:

```
cd web
npm install
npm run dev
```

Open the link it prints. The page shows only notes made by the wallet written on the line `TRUSTED` in `web/src/main.js`. To see your own notes, put your address there.

**Optional tests**

```
node scripts/expiry-test.mjs
node scripts/friction-probe.mjs
node scripts/guard-demo.mjs KEY "READ demo-file.txt"
```

Run `expiry-test` only once or twice. The public Arkiv server may limit how often you can ask.

**Files that stay on your computer (git ignores them):** `.env` (your key), `private-log.jsonl` (command text and salts), `demo-workspace/` (the pretend agent's work).

On Mac or Linux, to set a different key for one test, use `export PRIVATE_KEY=0x...` instead of `set PRIVATE_KEY=0x...`.

## What we checked on the real chain

We ran these on the Tiramisu testnet and looked at the results.

| What | Result |
| --- | --- |
| A lease ends by itself | A 60 second lease (30 blocks) was still returned at block 725953. At block 725956, its end block, Arkiv answered "not found". It was never returned at or after its end block in this run. |
| Leash stops an agent when the lease ends | Seen with a 150 second lease (28 steps) and a 90 second lease (17 steps). |
| Leash refuses to start without a live lease | `BLOCKED NO_LIVE_LEASE` |
| Leash refuses a program that is not on the list | `BLOCKED COMMAND_NOT_ALLOWED` |
| The stop button | Two runs ended with `COMMAND_KILLED_LEASE_GONE`. The "killed" note came 1 and 2 blocks after the "revoked" note. |
| Diary notes hold only a hash | Seen in `read-audit` (`hash ...`) |
| The guard rejects a lease made by another wallet | `BLOCKED (WRONG_CREATOR)` printed in the terminal. We ran the guard with a throw-away wallet that had no tokens, so the note could not be saved. |
| A query with a number range | `block >= u64(734000)` found 8 notes. The same query with a plain number found 0 notes and no error (see `arkiv/friction.md`). |

**Not seen yet on the real chain:** the reasons `EXPIRED`, `CHECK_FAILED` and `COMMAND_KILLED_CANNOT_CHECK_LEASE`. They are tested in code only.

## Honest limits

- **Leash is not a sandbox.** It only stops the program it started. An agent that runs outside leash is not stopped.
- **Leash checks which program may run, not what the program does.** If you allow `node`, node can do anything node can do.
- **Leash cannot protect secrets that sit in files.** It only keeps secrets out of the program's environment variables. That was exactly the PocketOS problem.
- **A stolen key is a risk.** On Arkiv, the owner wallet can change or delete its own notes. One wallet makes everything here.
- **The diary is not fully private.** The lease key, the answer, the reason, the time and the block number are public. Anyone can see when the agent was active. Only the command text is hidden.
- **Older notes** (made before we added privacy mode) show the command text. Newer notes show only the hash.
- **Revoke is not instant.** Leash finds it within about 15 seconds.
- **Notes disappear after 30 days.** After that, the proof is the transactions on the explorer.
- **We tested leash with a pretend agent, not a real AI tool.** Leash removes variables with API_KEY or TOKEN in their name, so a real AI tool would not get its own key under leash today. A setting to let chosen variables through is not built yet.
- **This is a testnet demo** with made-up data. It is not ready for real use.

## Why Arkiv

- A lease must end by itself, and on Arkiv every entity has a built-in life time. We do not run a cleaner.
- Arkiv records who created each note. Our guard and page use that to ignore fake notes. Anyone can write a note called "lease" or "audit", so we trust who made it, not the name.
- Anyone can read the notes from the public server. We run no server.

More in the form answers and in `arkiv/schema.md`. The problems we found are in `arkiv/friction.md`.

## Built with help from AI

I am a beginner. I used AI helpers (Claude and Google AI) to write and fix code and to learn Arkiv. I ran and tested everything myself on the Tiramisu testnet. The work was built during the hackathon, from 15 to 18 October 2026. There was no work before it. The libraries we use are `@arkiv-network/sdk`, `viem`, `dotenv` and `vite`.

## License

MIT
