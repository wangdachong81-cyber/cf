export type Role = "player" | "spectator";
export interface Input {
  seq: number;
  forward: number;
  strafe: number;
  yaw: number;
  pitch: number;
  jump: boolean;
  sprint: boolean;
  fire: boolean;
  reload: boolean;
}
export interface Body {
  x: number;
  y: number;
  z: number;
  vy: number;
}
export interface Player extends Body {
  id: string;
  name: string;
  color: string;
  yaw: number;
  pitch: number;
  health: number;
  kills: number;
  deaths: number;
  ammo: number;
  reloadAt: number;
  respawnAt: number;
  protectedUntil: number;
  ack: number;
}
export interface Shot {
  id: number;
  shooter: string;
  from: [number, number, number];
  to: [number, number, number];
  hit: string | null;
  kill: boolean;
}
export interface Feed {
  id: number;
  killer: string;
  victim: string;
}
export interface Snapshot {
  type: "state";
  now: number;
  room: string;
  phase: "waiting" | "playing" | "finished";
  endAt: number;
  nextAt: number;
  players: Player[];
  spectators: number;
  shots: Shot[];
  feed: Feed[];
}
export type ClientMessage =
  | { type: "join"; name: string; room?: string; role: Role; create: boolean }
  | { type: "input"; input: Input }
  | { type: "ping"; time: number };
export type ServerMessage =
  | Snapshot
  | { type: "welcome"; id: string; room: string; role: Role }
  | { type: "error"; message: string }
  | { type: "pong"; time: number };
export interface RoomInfo {
  code: string;
  players: number;
  spectators: number;
  phase: Snapshot["phase"];
}
