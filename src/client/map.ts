import { BLOCKS, WORLD_BOUNDS } from "../shared/config";
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
  const width = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX,
    height = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ;
  const scale = Math.min((w - 64) / width, (h - 64) / height);
  const mapWidth = width * scale,
    mapHeight = height * scale;
  const ox = (w - mapWidth) / 2,
    oy = (h - mapHeight) / 2;
  const X = (x: number) => ox + (x - WORLD_BOUNDS.minX) * scale;
  const Z = (z: number) => oy + (z - WORLD_BOUNDS.minZ) * scale;
  ctx.fillStyle = "#182322";
  ctx.fillRect(ox, oy, mapWidth, mapHeight);
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, mapWidth, mapHeight);
  ctx.clip();
  ctx.strokeStyle = "#293b36";
  ctx.lineWidth = 1;
  for (let n = 0; n <= 8; n++) {
    ctx.beginPath();
    ctx.moveTo(ox + (n * mapWidth) / 8, oy);
    ctx.lineTo(ox + (n * mapWidth) / 8, oy + mapHeight);
    ctx.moveTo(ox, oy + (n * mapHeight) / 8);
    ctx.lineTo(ox + mapWidth, oy + (n * mapHeight) / 8);
    ctx.stroke();
  }
  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = "#8d8964";
  ctx.beginPath();
  ctx.moveTo(X(0), oy + 5);
  ctx.lineTo(X(0), oy + mapHeight - 5);
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
  ctx.restore();
  ctx.strokeStyle = "#a8ad8b";
  ctx.strokeRect(ox, oy, mapWidth, mapHeight);
  ctx.fillStyle = "#8b9c91";
  ctx.font = "10px monospace";
  ctx.fillText("N ↑", ox, oy - 12);
  for (let i = 0; i < 8; i++) {
    ctx.fillText(
      String(i + 1).padStart(2, "0"),
      ox + (i * mapWidth) / 8 + 4,
      oy + mapHeight + 16,
    );
    ctx.fillText(
      String.fromCharCode(65 + i),
      ox - 16,
      oy + (i * mapHeight) / 8 + 14,
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
