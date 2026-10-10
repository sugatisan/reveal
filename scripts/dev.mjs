// Runs the Reveal API and the Expo app together. Ctrl+C stops both.
import { spawn } from "node:child_process";
import fs from "node:fs";

if (!fs.existsSync("app/node_modules")) {
  console.log("First run: installing the app's packages (one time, about a minute)…");
  const r = spawn("npm", ["install", "--no-audit", "--no-fund"], { cwd: "app", stdio: "inherit", shell: process.platform === "win32" });
  await new Promise((res, rej) => r.on("exit", (c) => (c === 0 ? res() : rej(new Error("npm install failed")))));
}

const procs = [
  ["api", "node", ["server/index.js"], {}],
  ["app", "npx", ["expo", "start", ...process.argv.slice(2)], { cwd: "app" }],
].map(([name, cmd, args, opts]) => {
  const p = spawn(cmd, args, { ...opts, stdio: name === "app" ? "inherit" : ["ignore", "pipe", "pipe"], env: process.env });
  if (p.stdout) p.stdout.on("data", (d) => process.stdout.write(`[api] ${d}`));
  if (p.stderr) p.stderr.on("data", (d) => process.stderr.write(`[api] ${d}`));
  p.on("exit", (code) => { console.log(`[${name}] stopped (${code})`); stop(); });
  return p;
});
function stop() { for (const p of procs) if (!p.killed) p.kill("SIGINT"); setTimeout(() => process.exit(0), 500); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
