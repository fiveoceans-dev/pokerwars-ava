#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [command = "dev", ...rest] = process.argv.slice(2);
const defaultPort = command === "dev" ? "8090" : "8090";
const port = process.env.PORT ?? defaultPort;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const shimDir = path.resolve(scriptDir, "shims");
process.env.PATH = `${shimDir}:${process.env.PATH ?? ""}`;

// Ensure Next skips Yarn-based lockfile patching in environments where Yarn isn't configured
if (command === "build") {
  if (!process.env.NEXT_SKIP_LOCKFILE_CHECK) {
    process.env.NEXT_SKIP_LOCKFILE_CHECK = "true";
  }
}

const args = [command];

if (command !== "build") {
  args.push("-H", "0.0.0.0", "-p", port, ...rest);
} else {
  args.push(...rest);
}

const child = spawn("next", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", forwardSignal);
process.on("SIGTERM", forwardSignal);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
