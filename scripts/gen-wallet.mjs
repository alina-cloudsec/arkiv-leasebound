import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";

if (existsSync(".env")) {
  console.log(".env already exists, not overwriting it");
  process.exit(1);
}
const key = "0x" + randomBytes(32).toString("hex");
appendFileSync(".env", `PRIVATE_KEY=${key}\n`);
console.log("Your public address:", privateKeyToAccount(key).address);



