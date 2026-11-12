import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";

for (const target of ["dev", "server"]) {
  test(
    `${target} reports occupied ports and exits without an unhandled error`,
    { timeout: 8000 },
    async () => {
      const occupied = createServer();
      occupied.listen(0, "0.0.0.0");
      await once(occupied, "listening");
      const port = (occupied.address() as { port: number }).port;
      const child = spawn(
        process.execPath,
        target === "dev"
          ? ["scripts/dev.mjs"]
          : ["--import", "tsx", "src/server/index.ts"],
        {
          env: { ...process.env, PORT: String(port), VITE_PORT: String(port) },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      child.stdout.on("data", (data) => (output += String(data)));
      child.stderr.on("data", (data) => (output += String(data)));
      const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
      try {
        const [code] = await once(child, "exit");
        assert.equal(code, 1, output);
        assert.match(output, new RegExp(`端口 ${port} 已被占用`));
        assert.doesNotMatch(
          output,
          /Unhandled|throw er|Arena server:|VITE .*ready/,
        );
        assert.equal(
          occupied.listening,
          true,
          "Existing listener must remain running",
        );
      } finally {
        clearTimeout(timeout);
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
        occupied.close();
      }
    },
  );
}
