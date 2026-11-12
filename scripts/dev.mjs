import { createServer } from "node:net";
import concurrently from "concurrently";

const ports = [
  { name: "游戏服务", port: Number(process.env.PORT ?? 3001) },
  { name: "前端页面", port: Number(process.env.VITE_PORT ?? 5173) },
];

function checkPort({ name, port }) {
  return new Promise((resolve) => {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error(
        `[启动失败] ${name}端口无效：${port}，请使用 1–65535 的整数。`,
      );
      resolve(false);
      return;
    }
    const probe = createServer();
    probe.once("error", (error) => {
      console.error(
        error.code === "EADDRINUSE"
          ? `[启动失败] ${name}端口 ${port} 已被占用。请先在原来的开发终端按 Ctrl+C 停止旧服务，再重新运行 npm run dev。`
          : `[启动失败] 无法使用${name}端口 ${port}：${error.message}`,
      );
      resolve(false);
    });
    probe.listen({ port, host: "0.0.0.0", exclusive: true }, () => {
      probe.close(() => resolve(true));
    });
  });
}

const available = await Promise.all(ports.map(checkPort));
if (available.some((value) => !value)) {
  console.error("也可更换端口：PORT=3002 VITE_PORT=5174 npm run dev");
  process.exitCode = 1;
} else if (ports[0].port === ports[1].port) {
  console.error("[启动失败] 游戏服务和前端页面必须使用不同端口。");
  process.exitCode = 1;
} else {
  const { result } = concurrently(
    [
      { name: "server", command: "tsx watch src/server/index.ts" },
      { name: "client", command: "vite --host 0.0.0.0" },
    ],
    { killOthersOn: ["success", "failure"] },
  );
  try {
    await result;
  } catch {
    process.exitCode = 1;
  }
}
