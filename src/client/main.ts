import "./style.css";
import { RULES } from "../shared/config";
import { move } from "../shared/physics";
import type {
  Body,
  Input,
  Player,
  Role,
  RoomInfo,
  ServerMessage,
  Snapshot,
} from "../shared/protocol";
import { ArenaView } from "./scene";
import { drawMap } from "./map";
import { Sound } from "./audio";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const storedName = localStorage.getItem("arena-name") ?? "";
document.querySelector("#app")!.innerHTML = `
 <canvas id="world" aria-label="港区三维游戏场景"></canvas><div class="vignette"></div>
 <header class="masthead"><a class="brand" href="/" aria-label="几猫港区混战首页"><span class="brand-mark">几</span><span>几猫<span class="brand-sub">JIMAO / ARENA</span></span></a><div class="header-meta"><span class="live-dot"></span><span id="connection">PORT 07 · 多人竞技场</span><label class="quality-control" for="quality">画质<select id="quality" aria-label="画质"><option value="low">低</option><option value="medium">中</option><option value="high" selected>高</option><option value="ultra">极高</option></select></label><button id="sound" class="icon-button" title="切换音效">声音 开</button></div></header>
 <main id="lobby">
  <div class="lobby-copy"><div class="eyebrow"><span></span> FREE FOR ALL / 个人混战</div><h1>港区<span>没有队友。</span></h1><p class="intro">穿过集装箱，听见下一声枪响。<br>随机入场，每个人都是你的对手。</p><div class="rules-strip"><div><b>08</b><span>参战席位</span></div><div><b>05<span> MIN</span></b><span>每局时长</span></div><div><b>20</b><span>击杀制胜</span></div></div><div class="scene-caption"><span>01 / DOCKYARD</span><span>港区货运场 · 自由交战区</span></div></div>
  <section class="entry-panel"><div class="panel-heading"><span class="eyebrow">DEPLOYMENT</span><span class="tiny">ONLINE PVP</span></div><h2>准备入场</h2><p class="panel-desc">呼叫朋友，或者先看看战局。</p>
   <label for="nickname">你的代号 <span>最多 12 个字符</span></label><input id="nickname" maxlength="12" placeholder="输入昵称" autocomplete="nickname" value="${escape(storedName)}"/>
   <div class="role-tabs" role="group" aria-label="入场身份"><button data-role="player" class="selected">参与对战<span>第一人称 · 个人战</span></button><button data-role="spectator">俯视观战<span>全图态势 · 实时追踪</span></button></div>
   <label for="room-code">房间号 <span>加入朋友的房间时填写</span></label><div class="join-row"><input id="room-code" maxlength="6" inputmode="numeric" placeholder="6 位房间号"/><button id="join" class="secondary">加入 →</button></div>
   <button id="create" class="primary">创建房间 <span>↗</span></button><p id="entry-error" class="error" role="alert"></p>
   <div class="room-heading"><span>开放房间</span><button id="refresh">刷新 ↻</button></div><div id="rooms" class="rooms"><span class="empty">正在搜索房间…</span></div>
   <div class="panel-foot"><span class="live-dot"></span>无需注册 · 分享房间号即可联机</div>
  </section>
  <footer class="lobby-footer"><span>W A S D 移动 <i>/</i> 鼠标 瞄准 <i>/</i> 左键 射击 <i>/</i> R 换弹</span><span>WEBGL · BUILD 0.1</span></footer>
 </main>
 <section id="session" hidden>
  <div class="match-bar"><div><span id="mode-label" class="eyebrow">个人混战</span><b id="room-title">ROOM —</b></div><div class="clock"><b id="timer">等待玩家</b><span id="phase-hint">至少 2 人开始计分</span></div><div class="match-actions"><button id="invite">复制邀请链接</button><button id="leave">退出房间 ↗</button></div></div>
  <div id="spectator" hidden><div class="map-heading"><span>TACTICAL OVERVIEW / 战术态势</span><span><i class="live-dot"></i> LIVE</span></div><canvas id="tactical" aria-label="实时俯视观战地图"></canvas><div class="map-legend"><span>● 存活</span><span>○ 出生保护</span><span>× 等待复活</span><span>短线表示朝向</span></div></div>
  <aside id="ranking" class="ranking"><div class="ranking-title"><span>实时排名</span><span id="player-count">0 / 8</span></div><div class="ranking-cols"><span>玩家</span><span>击杀 / 死亡</span></div><div id="rank-rows"></div><div class="ranking-foot" id="spectator-count"></div></aside>
  <div id="feed" class="kill-feed"></div><div id="crosshair"><i></i><i></i><i></i><i></i><b></b></div><div id="hitmarker">×</div><div id="damage"></div>
  <div id="combat-hud"><div class="health"><span class="tiny">VITALS / 生命</span><div><b id="health">100</b><span>HP</span></div><i><i id="health-bar"></i></i></div><div class="combat-info"><span id="personal-score">0 击杀 / 0 死亡</span><span id="protection"></span></div><div class="ammo"><span class="tiny">JM-01 / 制式步枪</span><div><b id="ammo">30</b><span>/ 30</span></div><span id="reload-hint">R 换弹 · 弹匣无限补给</span></div></div>
  <div id="game-prompt" class="game-prompt"><span class="eyebrow">READY TO ENGAGE</span><h2 id="prompt-title">点击进入战场</h2><p id="prompt-description">锁定鼠标，开始移动与射击</p><button id="resume" class="primary">进入战场 →</button><span class="prompt-keys">WASD 移动 · Shift 冲刺 · Space 跳跃<br>左键射击 · 右键瞄准 · R 换弹 · Tab 排名 · Esc 释放鼠标</span></div>
  <div id="results" class="results" hidden><span class="eyebrow">ROUND COMPLETE / 对局结束</span><h2 id="winner">本局结算</h2><div id="result-rows"></div><p id="next-round"></p></div>
  <div id="session-footer"><span id="session-status">正在同步</span><span id="network">— ms</span></div>
 </section><div id="toast" role="status"></div>
`;
function setEngineLoading(loading: boolean) {
  $<HTMLButtonElement>("create").disabled = loading;
  $<HTMLButtonElement>("join").disabled = loading;
  $("entry-error").classList.toggle("loading", loading);
}
let view: ArenaView;
try {
  setEngineLoading(true);
  view = await ArenaView.create($<HTMLCanvasElement>("world"), (text) => {
    $("entry-error").textContent = text;
  });
  setEngineLoading(false);
  $<HTMLSelectElement>("quality").value = view.quality;
  $("quality").onchange = () =>
    view.setQuality($<HTMLSelectElement>("quality").value);
  $("entry-error").textContent = "";
  if (import.meta.env.DEV) Object.assign(window, { __arena: view });
} catch (error) {
  $("entry-error").textContent = "无法启动 WebGL，请启用浏览器硬件加速后刷新。";
  $("create").setAttribute("disabled", "");
  $("join").setAttribute("disabled", "");
  throw error;
}
const sound = new Sound();
let socket: WebSocket | null = null,
  role: Role = "player",
  selectedRole: Role = "player",
  self = "",
  snapshot: Snapshot | null = null;
let body: Body | null = null,
  yaw = 0,
  pitch = 0,
  seq = 0,
  pending: Input[] = [],
  keys = new Set<string>(),
  firing = false,
  ads = false,
  jump = false,
  reload = false,
  lastProtected = 0,
  lastHealth = 100;
let serverOffset = 0,
  lastMessage = 0,
  lastShot = 0,
  seenShots = new Set<number>(),
  lastFrame = performance.now(),
  busy = false,
  toastTimer = 0;
view.onRecoil = (vertical, horizontal) => {
  pitch = Math.min(1.45, pitch + vertical);
  yaw += horizontal;
};
const now = () => Date.now() + serverOffset;
const inGame = () =>
  !!self &&
  role === "player" &&
  snapshot?.phase !== "finished" &&
  (snapshot?.players.find((p) => p.id === self)?.health ?? 0) > 0;
const locked = () => document.pointerLockElement === $("world");
function toast(text: string) {
  $("toast").textContent = text;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => $("toast").classList.remove("visible"),
    2500,
  );
}
function resetControls() {
  keys.clear();
  firing = false;
  ads = false;
  jump = false;
  reload = false;
}
function setBusy(value: boolean) {
  busy = value;
  for (const id of ["create", "join"])
    $<HTMLButtonElement>(id).disabled = value;
}
function closeSession() {
  const old = socket;
  socket = null;
  old?.close();
  self = "";
  snapshot = null;
  body = null;
  pending = [];
  seq = 0;
  lastProtected = 0;
  seenShots.clear();
  resetControls();
  if (locked()) document.exitPointerLock();
  document.body.classList.remove("deployed");
  $("lobby").hidden = false;
  $("session").hidden = true;
  $("connection").textContent = "PORT 07 · 多人竞技场";
  $("ranking").classList.remove("expanded");
  setBusy(false);
  view.setCombatState(undefined);
  view.sync([], "");
  void loadRooms();
}
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-role]",
))
  button.onclick = () => {
    selectedRole = button.dataset.role as Role;
    document
      .querySelectorAll("[data-role]")
      .forEach((b) => b.classList.toggle("selected", b === button));
  };
async function loadRooms() {
  try {
    const res = await fetch("/api/rooms");
    if (!res.ok) throw Error();
    const rooms = (await res.json()) as RoomInfo[];
    $("rooms").innerHTML = rooms.length
      ? rooms
          .slice(0, 6)
          .map(
            (r) =>
              `<button class="room-item" data-room="${r.code}"><span><i class="live-dot"></i> ${r.code}</span><span>${r.players}/8 <small>${r.phase === "playing" ? "交战中" : r.phase === "finished" ? "结算中" : "等待中"}</small> ↗</span></button>`,
          )
          .join("")
      : '<span class="empty">暂无房间，创建一个叫朋友来玩。</span>';
    document.querySelectorAll<HTMLButtonElement>("[data-room]").forEach(
      (b) =>
        (b.onclick = () => {
          $<HTMLInputElement>("room-code").value = b.dataset.room!;
          connect(false);
        }),
    );
  } catch {
    $("rooms").innerHTML =
      '<span class="empty">服务暂未连接，请确认后端已启动。</span>';
  }
}
function connect(create: boolean) {
  if (busy) return;
  const name = $<HTMLInputElement>("nickname").value.trim(),
    code = $<HTMLInputElement>("room-code").value.trim();
  if (!name) {
    $("entry-error").textContent = "先给自己起个代号。";
    $("nickname").focus();
    return;
  }
  if (!create && !/^\d{6}$/.test(code)) {
    $("entry-error").textContent = "请输入 6 位房间号。";
    return;
  }
  setBusy(true);
  $("entry-error").textContent = "";
  localStorage.setItem("arena-name", name);
  sound.unlock();
  const ws = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
  );
  socket = ws;
  const timeout = setTimeout(() => {
    if (!self && socket === ws) {
      closeSession();
      $("entry-error").textContent = "连接超时，请确认后端已启动。";
    }
  }, 8000);
  ws.onopen = () =>
    ws.send(
      JSON.stringify({
        type: "join",
        name,
        room: code,
        role: selectedRole,
        create,
      }),
    );
  ws.onmessage = (event) => {
    if (socket !== ws) return;
    const msg = JSON.parse(event.data) as ServerMessage;
    lastMessage = Date.now();
    if (msg.type === "error") {
      clearTimeout(timeout);
      closeSession();
      $("entry-error").textContent = msg.message;
      return;
    }
    if (msg.type === "welcome") {
      clearTimeout(timeout);
      setBusy(false);
      self = msg.id;
      role = msg.role;
      document.body.classList.add("deployed");
      $("lobby").hidden = true;
      $("session").hidden = false;
      $("spectator").hidden = role !== "spectator";
      $("combat-hud").hidden = role !== "player";
      $("crosshair").hidden = role !== "player";
      $("game-prompt").hidden = role !== "player";
      $("ranking").classList.toggle("always", role === "spectator");
      $("mode-label").textContent =
        role === "spectator"
          ? "SPECTATOR / 俯视观战"
          : "FREE FOR ALL / 个人混战";
      $("room-title").textContent = `ROOM ${msg.room}`;
      $("connection").textContent =
        `${msg.room} · ${role === "player" ? "已部署" : "观战中"}`;
      history.replaceState(null, "", `?room=${msg.room}`);
      return;
    }
    if (msg.type === "pong") {
      $("network").textContent = `${Math.max(0, Date.now() - msg.time)} ms`;
      return;
    }
    if (msg.type === "state") receive(msg);
  };
  ws.onerror = () => {
    if (!self && socket === ws) {
      clearTimeout(timeout);
      closeSession();
      $("entry-error").textContent = "连接失败，请确认游戏服务已启动。";
    }
  };
  ws.onclose = () => {
    clearTimeout(timeout);
    if (socket === ws) {
      const wasJoined = !!self;
      closeSession();
      $("entry-error").textContent = wasJoined
        ? "连接已断开，请重新加入房间。"
        : "无法连接游戏服务。";
    }
  };
}
function receive(state: Snapshot) {
  snapshot = state;
  serverOffset = state.now - Date.now();
  const me = state.players.find((p) => p.id === self);
  if (me) {
    pending = pending.filter((i) => i.seq > me.ack);
    const respawn = me.protectedUntil > lastProtected && me.health > 0;
    if (respawn) {
      yaw = me.yaw;
      pitch = me.pitch;
      pending = [];
      resetControls();
    }
    lastProtected = me.protectedUntil;
    const corrected = { x: me.x, y: me.y, z: me.z, vy: me.vy };
    if (me.health > 0 && state.phase !== "finished")
      for (const i of pending) move(corrected, i, 1 / RULES.tickRate);
    body = corrected;
    if (me.health < lastHealth) {
      $("damage").classList.add("on");
      setTimeout(() => $("damage").classList.remove("on"), 180);
    }
    lastHealth = me.health;
  }
  view.setCombatState(me);
  view.sync(state.players, self);
  for (const shot of state.shots) {
    if (seenShots.has(shot.id)) continue;
    seenShots.add(shot.id);
    view.shot(shot, self);
    const distance = body
      ? Math.hypot(shot.from[0] - body.x, shot.from[2] - body.z)
      : 40;
    sound.shot(
      shot.shooter === self ? 0.18 : Math.max(0.015, 0.09 - distance * 0.0015),
    );
    if (shot.shooter === self && shot.hit) {
      $("hitmarker").classList.add("on");
      $("hitmarker").style.color = shot.kill ? "#ef795f" : "#fff";
      setTimeout(() => $("hitmarker").classList.remove("on"), 150);
    }
  }
  if (seenShots.size > 200) seenShots = new Set([...seenShots].slice(-100));
  updateUI(state, me);
}
function ordered(players: Player[]) {
  return [...players].sort(
    (a, b) =>
      b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name),
  );
}
function rows(players: Player[], full = false) {
  return ordered(players)
    .map(
      (p, i) =>
        `<div class="rank-row ${p.id === self ? "self" : ""}"><span class="rank-number">${String(i + 1).padStart(2, "0")}</span><i style="background:${p.color}"></i><span class="rank-name">${escape(p.name)}${p.id === self ? "<small>你</small>" : ""}${p.health <= 0 ? "<small>复活中</small>" : ""}</span><b>${p.kills}</b><span class="deaths">/ ${p.deaths}</span>${full ? `<span class="kd">${(p.kills / Math.max(1, p.deaths)).toFixed(1)} K/D</span>` : ""}</div>`,
    )
    .join("");
}
function updateUI(s: Snapshot, me?: Player) {
  $("rank-rows").innerHTML = rows(s.players);
  $("player-count").textContent = `${s.players.length} / 8`;
  $("spectator-count").textContent = `${s.spectators} 人正在观战`;
  $("feed").innerHTML = s.feed
    .slice(-4)
    .map(
      (f) =>
        `<div><b>${escape(f.killer)}</b><span> ⌁ </span>${escape(f.victim)}</div>`,
    )
    .join("");
  $("results").hidden = s.phase !== "finished";
  if (s.phase === "finished") {
    const ranked = ordered(s.players);
    const first = ranked[0];
    const ties = ranked.filter(
      (p) => first && p.kills === first.kills && p.deaths === first.deaths,
    );
    $("winner").textContent =
      ties.length > 1
        ? "并列获胜"
        : first
          ? `${first.name} 拿下本局`
          : "本局结束";
    $("result-rows").innerHTML = rows(s.players, true);
    if (locked()) document.exitPointerLock();
  }
  if (me) {
    $("health").textContent = String(me.health);
    $("health-bar").style.width = `${me.health}%`;
    $("ammo").textContent = String(me.ammo);
    $("personal-score").textContent = `${me.kills} 击杀 / ${me.deaths} 死亡`;
    $("reload-hint").textContent = me.reloadAt
      ? "正在换弹…"
      : me.ammo === 0
        ? "弹匣已空 · 按 R 换弹"
        : "R 换弹 · 弹匣无限补给";
  }
  updatePrompt();
}
function updatePrompt() {
  const me = snapshot?.players.find((p) => p.id === self);
  if (!me || role !== "player") {
    $("game-prompt").hidden = true;
    return;
  }
  const dead = me.health <= 0,
    finished = snapshot?.phase === "finished";
  $("game-prompt").hidden = finished || (!dead && locked());
  $("crosshair").style.opacity = dead || !locked() ? "0" : "1";
  $("prompt-title").textContent = dead ? "你被击倒了" : "点击进入战场";
  $("prompt-description").textContent = dead
    ? "正在准备随机位置复活"
    : "锁定鼠标，开始移动与射击";
  $("resume").hidden = dead;
}
$("create").onclick = () => connect(true);
$("join").onclick = () => connect(false);
$("refresh").onclick = () => void loadRooms();
$("leave").onclick = () => {
  closeSession();
  history.replaceState(null, "", location.pathname);
};
$("invite").onclick = async () => {
  try {
    await navigator.clipboard.writeText(
      `${location.origin}/?room=${snapshot?.room ?? ""}`,
    );
    toast("邀请链接已复制，发给朋友即可加入。");
  } catch {
    toast(`房间号：${snapshot?.room}，请手动复制浏览器地址。`);
  }
};
$("resume").onclick = async () => {
  if (!inGame()) return;
  sound.unlock();
  try {
    await $<HTMLCanvasElement>("world").requestPointerLock();
  } catch {
    toast("鼠标锁定未成功，请再次点击进入战场。");
  }
};
$("sound").onclick = () => {
  sound.unlock();
  sound.muted = !sound.muted;
  $("sound").textContent = sound.muted ? "声音 关" : "声音 开";
};
document.addEventListener("pointerlockchange", () => {
  if (!locked()) resetControls();
  updatePrompt();
});
window.addEventListener("blur", resetControls);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) resetControls();
});
window.addEventListener("keydown", (event) => {
  if (!self || role !== "player") return;
  if (event.code === "Tab") {
    event.preventDefault();
    $("ranking").classList.add("expanded");
    return;
  }
  if (!locked()) return;
  if (["Space", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code))
    event.preventDefault();
  keys.add(event.code);
  if (event.code === "Space" && !event.repeat) jump = true;
  if (event.code === "KeyR" && !event.repeat) reload = true;
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
  if (event.code === "Tab") $("ranking").classList.remove("expanded");
});
window.addEventListener("mousemove", (event) => {
  if (!locked() || !inGame()) return;
  const sensitivity = ads ? 0.0012 : 0.002;
  yaw -= event.movementX * sensitivity;
  pitch = Math.max(
    -1.45,
    Math.min(1.45, pitch - event.movementY * sensitivity),
  );
});
window.addEventListener("mousedown", (event) => {
  if (!locked() || !inGame()) return;
  if (event.button === 0) firing = true;
  if (event.button === 2) ads = true;
});
window.addEventListener("mouseup", (event) => {
  if (event.button === 0) firing = false;
  if (event.button === 2) ads = false;
});
window.addEventListener("contextmenu", (event) => {
  if (self) event.preventDefault();
});
setInterval(() => {
  if (!self || role !== "player" || socket?.readyState !== WebSocket.OPEN)
    return;
  const active = locked() && inGame();
  const input: Input = {
    seq: ++seq,
    forward: active ? Number(keys.has("KeyW")) - Number(keys.has("KeyS")) : 0,
    strafe: active ? Number(keys.has("KeyD")) - Number(keys.has("KeyA")) : 0,
    yaw,
    pitch,
    jump: active && jump,
    sprint: active && keys.has("ShiftLeft") && !ads,
    fire: active && firing,
    reload: active && reload,
  };
  jump = false;
  reload = false;
  socket.send(JSON.stringify({ type: "input", input }));
  pending.push(input);
  if (pending.length > 30) pending.shift();
  if (body && inGame()) move(body, input, 1 / RULES.tickRate);
}, 1000 / RULES.tickRate);
setInterval(() => {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "ping", time: Date.now() }));
    if (self && Date.now() - lastMessage > 6000) {
      toast("连接无响应，正在返回大厅。");
      closeSession();
    }
  }
}, 2000);
function frame(time: number) {
  const dt = Math.min(0.05, (time - lastFrame) / 1000);
  lastFrame = time;
  const me = snapshot?.players.find((p) => p.id === self);
  const playerView =
    role === "player" &&
    self &&
    me &&
    me.health > 0 &&
    snapshot?.phase !== "finished";
  if (role !== "spectator" || !self)
    view.frame(
      dt,
      time / 1000,
      playerView ? body : null,
      yaw,
      pitch,
      ads,
      keys.size > 0 && locked(),
    );
  if (snapshot) {
    const current = now();
    if (role === "spectator")
      drawMap($<HTMLCanvasElement>("tactical"), snapshot.players, current);
    $("timer").textContent =
      snapshot.phase === "waiting"
        ? "等待玩家"
        : snapshot.phase === "finished"
          ? "本局结束"
          : `${String(Math.floor(Math.max(0, snapshot.endAt - current) / 60000)).padStart(2, "0")}:${String(Math.floor(Math.max(0, snapshot.endAt - current) / 1000) % 60).padStart(2, "0")}`;
    $("phase-hint").textContent =
      snapshot.phase === "waiting"
        ? "自由活动 · 至少 2 人开始计分"
        : snapshot.phase === "finished"
          ? "正在准备下一局"
          : "20 次击杀制胜 · 全员敌对";
    $("next-round").textContent =
      `${Math.max(0, Math.ceil((snapshot.nextAt - current) / 1000))} 秒后自动开始下一局`;
    $("session-status").textContent =
      role === "spectator"
        ? "俯视观战 / 全图位置实时同步"
        : snapshot.phase === "waiting"
          ? "等待对手加入 · 可自由熟悉地图"
          : "个人混战 / Tab 查看排名";
    if (me) {
      $("protection").textContent =
        me.protectedUntil > current
          ? `出生保护 ${((me.protectedUntil - current) / 1000).toFixed(1)}s · 开火取消`
          : "";
      if (me.health <= 0)
        $("prompt-description").textContent =
          `${Math.max(0, Math.ceil((me.respawnAt - current) / 1000))} 秒后随机位置复活`;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
void loadRooms();
const inviteCode = new URLSearchParams(location.search).get("room");
if (inviteCode && /^\d{6}$/.test(inviteCode))
  $<HTMLInputElement>("room-code").value = inviteCode;
