import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STUDIO_DIR = path.resolve(__dirname, "..");
const MCP_SERVER_ENTRY = path.resolve(
  STUDIO_DIR,
  "..",
  "mcp-server",
  "src",
  "server.js",
);
const MCP_PORT = Number(process.env.PORT || 3333);

function isMcpAlreadyRunning() {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port: MCP_PORT,
        path: "/health",
        timeout: 800,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  let mcpChild = null;
  const alreadyUp = await isMcpAlreadyRunning();

  if (alreadyUp) {
    console.log(`[remotion-mcp] MCP server already active on port ${MCP_PORT}.`);
  } else {
    console.log(`[remotion-mcp] Starting MCP server on port ${MCP_PORT}...`);
    mcpChild = spawn(process.execPath, [MCP_SERVER_ENTRY], {
      cwd: path.dirname(path.dirname(MCP_SERVER_ENTRY)),
      stdio: "inherit",
      env: process.env,
    });
    mcpChild.on("exit", (code) => {
      if (code && code !== 0) {
        console.error(`[remotion-mcp] MCP server exited with code ${code}`);
      }
    });
  }

  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const extraArgs = process.argv.slice(2);
  const studioChild = spawn(npxCmd, ["remotion", "studio", ...extraArgs], {
    cwd: STUDIO_DIR,
    stdio: "inherit",
    env: process.env,
  });

  const shutdown = (signal) => {
    if (studioChild && !studioChild.killed) {
      studioChild.kill(signal);
    }
    if (mcpChild && !mcpChild.killed) {
      mcpChild.kill(signal);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  studioChild.on("exit", (code) => {
    if (mcpChild && !mcpChild.killed) {
      mcpChild.kill("SIGTERM");
    }
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error("Failed to start Remotion + MCP:", err);
  process.exit(1);
});
