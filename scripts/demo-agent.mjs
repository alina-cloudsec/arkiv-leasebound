// A tiny pretend "AI agent". It keeps doing work until somebody stops it.
// It only writes a small text file inside the folder demo-workspace. It touches nothing else.
import { appendFileSync, mkdirSync } from "node:fs";

const useColor = (process.stdout.isTTY || process.env.FORCE_COLOR) && !process.env.NO_COLOR;
const magenta = (t) => (useColor ? `\x1b[1;35m${t}\x1b[0m` : t);

mkdirSync("demo-workspace", { recursive: true });
let step = 0;
console.log(`${magenta("[agent]")} started. I will keep working until someone stops me.`);

setInterval(() => {
  step++;
  appendFileSync("demo-workspace/work-log.txt", `step ${step} at ${new Date().toISOString()}\n`);
  console.log(`${magenta("[agent]")} did step ${step}`);
}, 3000);