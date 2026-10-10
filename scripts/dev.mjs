// Runs the Reveal API and the Expo app together. Ctrl+C stops both.
import { spawn } from "node:child_process";
import fs from "node:fs";

// Packages include native pieces built per machine, so reinstall if they came from a different OS/CPU.
const MARK = "app/node_modules/.reveal-platform";
const here = `${process.platform}-${process.arch}`;
const installedFor = fs.existsSync(MARK) ? fs.readFileSync(MARK, "utf8").trim() : null;
if (!fs.existsSync("app/node_modules") || installedFor !== here) {
  if (fs.existsSync("app/node_modules")) { console.log(`Reinstalling the app's packages for this computer (${here})…`); fs.rmSync("app/node_modules", { recursive: true, force: true }); }
  else console.log("First run: installing the app's packages (one time, about a minute)…");
  const r = spawn("npm", ["install", "--no-audit", "--no-fund"], { cwd: "app", stdio: "inherit", shell: process.platform === "win32" });
  await new Promise((res, rej) => r.on("exit", (c) => (c === 0 ? res() : rej(new Error("npm install failed")))));
  fs.writeFileSync(MARK, here);
}

// The API restarts itself when server code changes, and after a crash (node --watch would sit and wait
// for the next edit, leaving the app saying "can't reach the server").
let api = null, stopping = false, restarting = false, backoff = 1000, debounce = null;
function startApi() {
  api = spawn("node", ["server/index.js"], { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  const started = Date.now();
  api.stdout.on("data", (d) => process.stdout.write(`[api] ${d}`));
  api.stderr.on("data", (d) => process.stderr.write(`[api] ${d}`));
  api.on("exit", (code) => {
    if (stopping) return;
    if (restarting) { restarting = false; startApi(); return; }
    backoff = Date.now() - started > 10000 ? 1000 : Math.min(backoff * 2, 8000);
    console.log(`[api] stopped (${code}). Restarting in ${backoff / 1000}s…`);
    setTimeout(() => !stopping && startApi(), backoff);
  });
}
function restartApi() {
  if (!api || api.exitCode !== null) return startApi();
  restarting = true;
  api.kill("SIGTERM");
  setTimeout(() => { if (restarting && api.exitCode === null) api.kill("SIGKILL"); }, 3000);
}
startApi();
fs.watch("server", { recursive: true }, (_, file) => {
  if (!file || !/\.(m?js|json)$/.test(file)) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => { console.log(`[api] ${file} changed, restarting…`); restartApi(); }, 400);
});

const app = spawn("npx", ["expo", "start", ...process.argv.slice(2)], { cwd: "app", stdio: "inherit", env: process.env });
app.on("exit", (code) => { console.log(`[app] stopped (${code})`); stop(); });
function stop() { stopping = true; for (const p of [api, app]) if (p && p.exitCode === null) p.kill("SIGINT"); setTimeout(() => process.exit(0), 500); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
