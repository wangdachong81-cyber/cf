import { randomUUID } from "node:crypto";
import { COLORS, RULES } from "../shared/config";
import {
  direction,
  freeAt,
  move,
  rayBox,
  wallDistance,
} from "../shared/physics";
import type {
  Feed,
  Input,
  Player,
  Role,
  Shot,
  Snapshot,
} from "../shared/protocol";
const idle = (): Input => ({
  seq: 0,
  forward: 0,
  strafe: 0,
  yaw: 0,
  pitch: 0,
  jump: false,
  sprint: false,
  fire: false,
  reload: false,
});
export interface Member {
  id: string;
  role: Role;
  player?: Player;
  queue: Input[];
  lastSeq: number;
  lastInputAt: number;
  lastShot: number;
}
export class Room {
  members = new Map<string, Member>();
  phase: Snapshot["phase"] = "waiting";
  endAt = 0;
  nextAt = 0;
  shots: Shot[] = [];
  feed: Feed[] = [];
  eventId = 0;
  constructor(public code: string) {}
  get players() {
    return [...this.members.values()].flatMap((m) =>
      m.player ? [m.player] : [],
    );
  }
  add(name: string, role: Role, now: number) {
    if (
      [...this.members.values()].filter((m) => m.role === role).length >=
      (role === "player" ? RULES.maxPlayers : RULES.maxSpectators)
    )
      throw Error(
        role === "player" ? "参战席位已满，可选择观战" : "观战席位已满",
      );
    const id = randomUUID();
    const member: Member = {
      id,
      role,
      queue: [],
      lastSeq: 0,
      lastInputAt: now,
      lastShot: 0,
    };
    if (role === "player") {
      const color = COLORS.find(
        (c) => !this.players.some((p) => p.color === c),
      )!;
      member.player = {
        id,
        name,
        color,
        x: 0,
        y: 0,
        z: 0,
        vy: 0,
        yaw: 0,
        pitch: 0,
        health: 100,
        kills: 0,
        deaths: 0,
        ammo: RULES.magazine,
        reloadAt: 0,
        respawnAt: 0,
        protectedUntil: 0,
        ack: 0,
      };
      this.spawn(member.player, now);
    }
    this.members.set(id, member);
    return member;
  }
  remove(id: string) {
    this.members.delete(id);
    if (!this.players.length) {
      this.phase = "waiting";
      this.endAt = 0;
      this.nextAt = 0;
      this.feed = [];
    }
  }
  spawn(p: Player, now: number) {
    let best = { x: 0, z: 0, score: -Infinity };
    for (let i = 0; i < 160; i++) {
      const x = (Math.random() - 0.5) * 58,
        z = (Math.random() - 0.5) * 58;
      if (!freeAt(x, z, 1)) continue;
      const others = this.players.filter((o) => o.id !== p.id && o.health > 0);
      const score = others.length
        ? Math.min(...others.map((o) => Math.hypot(x - o.x, z - o.z)))
        : Math.random();
      if (score > best.score) best = { x, z, score };
    }
    Object.assign(p, {
      x: best.x,
      z: best.z,
      y: 0,
      vy: 0,
      yaw: Math.atan2(best.x, best.z),
      pitch: 0,
      health: 100,
      ammo: RULES.magazine,
      reloadAt: 0,
      respawnAt: 0,
      protectedUntil: now + RULES.protection,
    });
  }
  input(member: Member, raw: unknown, now: number) {
    if (!member.player || !raw || typeof raw !== "object") return;
    const i = raw as Input;
    if (
      !Number.isSafeInteger(i.seq) ||
      i.seq <= member.lastSeq ||
      !Number.isFinite(i.yaw) ||
      !Number.isFinite(i.pitch) ||
      !Number.isFinite(i.forward) ||
      !Number.isFinite(i.strafe)
    )
      return;
    member.lastSeq = i.seq;
    member.lastInputAt = now;
    // Bounded queue: additional network messages never increase simulation speed.
    if (member.queue.length >= 8) member.queue.shift();
    member.queue.push({
      seq: i.seq,
      forward: Math.max(-1, Math.min(1, i.forward)),
      strafe: Math.max(-1, Math.min(1, i.strafe)),
      yaw: i.yaw % (Math.PI * 2),
      pitch: Math.max(-1.45, Math.min(1.45, i.pitch)),
      jump: i.jump === true,
      sprint: i.sprint === true,
      fire: i.fire === true,
      reload: i.reload === true,
    });
  }
  start(now: number) {
    this.phase = "playing";
    this.endAt = now + RULES.duration;
    this.nextAt = 0;
    this.feed = [];
    for (const m of this.members.values())
      if (m.player) {
        m.player.kills = 0;
        m.player.deaths = 0;
        this.spawn(m.player, now);
        m.queue = [];
      }
  }
  finish(now: number) {
    this.phase = "finished";
    this.nextAt = now + RULES.roundBreak;
    for (const m of this.members.values()) m.queue = [];
  }
  tick(now: number) {
    if (this.phase === "waiting" && this.players.length >= 2) this.start(now);
    if (this.phase === "finished") {
      if (now >= this.nextAt) {
        if (this.players.length >= 2) this.start(now);
        else {
          this.phase = "waiting";
          this.endAt = 0;
          this.nextAt = 0;
          for (const p of this.players) {
            p.kills = 0;
            p.deaths = 0;
            this.spawn(p, now);
          }
        }
      }
      return;
    }
    if (this.phase === "playing" && now >= this.endAt) {
      this.finish(now);
      return;
    }
    for (const m of this.members.values()) {
      const p = m.player;
      if (!p) continue;
      const input = m.queue.shift() ?? idle();
      if (now - m.lastInputAt > 300) m.queue = [];
      p.ack = Math.max(p.ack, input.seq);
      if (p.health <= 0) {
        if (now >= p.respawnAt) this.spawn(p, now);
        continue;
      }
      if (p.reloadAt && now >= p.reloadAt) {
        p.ammo = RULES.magazine;
        p.reloadAt = 0;
      }
      if (input.seq) {
        p.yaw = input.yaw;
        p.pitch = input.pitch;
      }
      move(p, input, 1 / RULES.tickRate);
      if (input.reload && p.ammo < RULES.magazine && !p.reloadAt)
        p.reloadAt = now + RULES.reload;
      if (
        input.fire &&
        !p.reloadAt &&
        p.ammo > 0 &&
        now - m.lastShot >= RULES.fireInterval
      ) {
        this.fire(m, now);
        if (p.kills >= RULES.killLimit) break;
      }
    }
  }
  fire(m: Member, now: number) {
    const p = m.player!;
    p.ammo--;
    p.protectedUntil = 0;
    m.lastShot = now;
    const from: [number, number, number] = [p.x, p.y + RULES.eye, p.z],
      dir = direction(p.yaw, p.pitch);
    let distance = wallDistance(from, dir),
      victim: Player | undefined;
    for (const target of this.players) {
      if (target.id === p.id || target.health <= 0) continue;
      const d = rayBox(
        from,
        dir,
        [target.x - 0.36, target.y, target.z - 0.36],
        [target.x + 0.36, target.y + 1.85, target.z + 0.36],
      );
      if (d < distance) {
        distance = d;
        victim = target;
      }
    }
    let kill = false;
    const hit =
      victim && now >= victim.protectedUntil && this.phase === "playing"
        ? victim
        : undefined;
    if (hit) {
      hit.health = Math.max(0, hit.health - RULES.damage);
      if (!hit.health) {
        kill = true;
        hit.deaths++;
        hit.respawnAt = now + RULES.respawn;
        hit.reloadAt = 0;
        p.kills++;
        this.feed.push({
          id: ++this.eventId,
          killer: p.name,
          victim: hit.name,
        });
        this.feed = this.feed.slice(-5);
      }
    }
    this.shots.push({
      id: ++this.eventId,
      shooter: p.id,
      from,
      to: from.map((v, i) => v + dir[i] * distance) as [number, number, number],
      hit: hit?.id ?? null,
      kill,
    });
    if (p.kills >= RULES.killLimit) this.finish(now);
  }
  snapshot(now: number): Snapshot {
    return {
      type: "state",
      now,
      room: this.code,
      phase: this.phase,
      endAt: this.endAt,
      nextAt: this.nextAt,
      players: this.players.map((p) => ({ ...p })),
      spectators: [...this.members.values()].filter(
        (m) => m.role === "spectator",
      ).length,
      shots: this.shots,
      feed: this.feed,
    };
  }
}
