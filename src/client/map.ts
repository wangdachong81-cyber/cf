import { ARENA_SIZE, BLOCKS } from "../shared/config";
import type { Player } from "../shared/protocol";
export function drawMap(
  canvas: HTMLCanvasElement,
  players: Player[],
  now: number,
  labels = true,
) {
  const rect = canvas.getBoundingClientRect(),
    dpr = Math.min(devicePixelRatio, 2);
  if (
    canvas.width !== Math.round(rect.width * dpr) ||
    canvas.height !== Math.round(rect.height * dpr)
  ) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
  const ctx = canvas.getContext("2d")!;
  const w = rect.width,
    h = rect.height;
  if (!w || !h) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const size = Math.min(w, h) - 64,
    scale = size / ARENA_SIZE,
    ox = (w - size) / 2,
    oy = (h - size) / 2;
  const X = (x: number) => ox + (x + ARENA_SIZE / 2) * scale,
    Z = (z: number) => oy + (z + ARENA_SIZE / 2) * scale;
  ctx.fillStyle = "#182322";
  ctx.fillRect(ox, oy, size, size);
  ctx.strokeStyle = "#293b36";
  ctx.lineWidth = 1;
  for (let n = 0; n <= 8; n++) {
    ctx.beginPath();
    ctx.moveTo(ox + (n * size) / 8, oy);
    ctx.lineTo(ox + (n * size) / 8, oy + size);
    ctx.moveTo(ox, oy + (n * size) / 8);
    ctx.lineTo(ox + size, oy + (n * size) / 8);
    ctx.stroke();
  }
  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = "#8d8964";
  ctx.beginPath();
  ctx.moveTo(X(0), oy + 5);
  ctx.lineTo(X(0), oy + size - 5);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const b of BLOCKS) {
    ctx.fillStyle = b.color;
    ctx.globalAlpha = 0.65;
    ctx.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * scale, b.d * scale);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#b0c0ac44";
    ctx.strokeRect(
      X(b.x - b.w / 2),
      Z(b.z - b.d / 2),
      b.w * scale,
      b.d * scale,
    );
  }
  ctx.strokeStyle = "#a8ad8b";
  ctx.strokeRect(ox, oy, size, size);
  ctx.fillStyle = "#8b9c91";
  ctx.font = "10px monospace";
  ctx.fillText("N ↑", ox, oy - 12);
  for (let i = 0; i < 8; i++) {
    ctx.fillText(
      String(i + 1).padStart(2, "0"),
      ox + (i * size) / 8 + 4,
      oy + size + 16,
    );
    ctx.fillText(
      String.fromCharCode(65 + i),
      ox - 16,
      oy + (i * size) / 8 + 14,
    );
  }
  for (const p of players) {
    const x = X(p.x),
      z = Z(p.z);
    ctx.globalAlpha = p.health > 0 ? 1 : 0.3;
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    if (p.health <= 0) {
      ctx.beginPath();
      ctx.moveTo(x - 4, z - 4);
      ctx.lineTo(x + 4, z + 4);
      ctx.moveTo(x + 4, z - 4);
      ctx.lineTo(x - 4, z + 4);
      ctx.stroke();
      continue;
    }
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, z, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(x - Math.sin(p.yaw) * 8, z - Math.cos(p.yaw) * 8);
    ctx.lineTo(x - Math.sin(p.yaw) * 15, z - Math.cos(p.yaw) * 15);
    ctx.stroke();
    if (p.protectedUntil > now) {
      ctx.beginPath();
      ctx.arc(x, z, 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (labels) {
      ctx.font = "11px system-ui";
      ctx.fillText(p.name, x + 10, z - 9);
    }
  }
  ctx.globalAlpha = 1;
}
