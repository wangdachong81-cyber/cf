import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/server/game';
import { RULES } from '../src/shared/config';
import { direction, freeAt, move, wallDistance } from '../src/shared/physics';
import type { Input } from '../src/shared/protocol';
const input=(extra:Partial<Input>={}):Input=>({seq:1,forward:0,strafe:0,yaw:0,pitch:0,jump:false,sprint:false,fire:false,reload:false,...extra});
const time=1_000_000;
function duel(){const r=new Room('123456'),a=r.add('甲','player',time),b=r.add('乙','player',time);r.tick(time);Object.assign(a.player!,{x:-15,z:5,y:0,yaw:0,pitch:0,protectedUntil:0});Object.assign(b.player!,{x:-15,z:-5,y:0,protectedUntil:0});return{r,a,b};}
test('random spawn positions are navigable and keep distinct colors; spectator does not consume a slot',()=>{
 const room=new Room('123456');for(let i=0;i<8;i++){const m=room.add(String(i),'player',time);assert.ok(freeAt(m.player!.x,m.player!.z,1));}
 room.add('观察员','spectator',time);assert.equal(room.players.length,8);assert.equal(new Set(room.players.map(p=>p.color)).size,8);assert.throws(()=>room.add('9','player',time));
});
test('two players start a round; waiting shots cannot score',()=>{
 const room=new Room('123456'),a=room.add('甲','player',time);room.tick(time);assert.equal(room.phase,'waiting');room.add('乙','player',time);room.tick(time+1);assert.equal(room.phase,'playing');assert.equal(room.endAt,time+1+RULES.duration);assert.equal(a.player!.kills,0);
});
test('authoritative fire consumes ammo, kills, updates scores, and respawns',()=>{
 const{r,a,b}=duel();for(let i=0;i<3;i++)r.fire(a,time+3000+i*200);
 assert.equal(b.player!.health,0);assert.equal(a.player!.kills,1);assert.equal(b.player!.deaths,1);assert.equal(a.player!.ammo,27);assert.equal(r.feed.length,1);
 r.tick(time+6400);assert.equal(b.player!.health,100);assert.ok(b.player!.protectedUntil>time+6400);assert.ok(freeAt(b.player!.x,b.player!.z));
});
test('spawn protection prevents damage and ends when shooting',()=>{
 const{r,a,b}=duel();b.player!.protectedUntil=time+5000;r.fire(a,time+3000);assert.equal(b.player!.health,100);r.fire(b,time+3001);assert.equal(b.player!.protectedUntil,0);
});
test('container occlusion blocks shots',()=>{
 const{r,a,b}=duel();Object.assign(a.player!,{x:-7,z:1});Object.assign(b.player!,{x:-7,z:-12});r.fire(a,time+3000);assert.equal(b.player!.health,100);assert.equal(r.shots.at(-1)!.hit,null);assert.ok(wallDistance([-7,1.6,1],direction(0,0))<6);
});
test('input flooding does not increase movement speed; invalid inputs ignored',()=>{
 const{r,a}=duel();for(let seq=1;seq<=1000;seq++)r.input(a,input({seq,forward:1}),time+3000);
 assert.ok(a.queue.length<=8);const before=a.player!.z;r.tick(time+3000);assert.ok(Math.abs(before-a.player!.z)<=RULES.speed/RULES.tickRate+.0001);
 r.input(a,{...input({seq:1001}),yaw:NaN},time+3001);assert.equal(a.lastSeq,1000);
});
test('reload locks firing; replenishes magazine after timer',()=>{
 const{r,a}=duel();a.player!.ammo=1;r.input(a,input({reload:true,fire:true}),time+3000);r.tick(time+3000);assert.equal(a.player!.ammo,1);assert.ok(a.player!.reloadAt);r.tick(time+4801);assert.equal(a.player!.ammo,30);assert.equal(a.player!.reloadAt,0);
});
test('collision, diagonal movement, and jumping follow shared movement rules',()=>{
 const a={x:-15,y:0,z:5,vy:0},b={...a};move(a,input({forward:1}),.1);move(b,input({forward:1,strafe:1}),.1);assert.ok(Math.abs(Math.hypot(b.x+15,b.z-5)-Math.hypot(a.x+15,a.z-5))<1e-8);
 const c={x:31.5,y:0,z:0,vy:0};move(c,input({strafe:1}),.1);assert.equal(c.x,31.5);move(c,input({jump:true}),1/30);assert.ok(c.y>0);for(let n=0;n<60;n++)move(c,input(),1/30);assert.equal(c.y,0);
});
test('kill limit and timer finish matches; next round resets scores',()=>{
 const{r,a,b}=duel();a.player!.kills=19;b.player!.health=1;r.fire(a,time+3000);assert.equal(r.phase,'finished');r.tick(time+13001);assert.equal(r.phase,'playing');assert.equal(a.player!.kills,0);r.tick(r.endAt);assert.equal(r.phase,'finished');
});
test('departures and round transitions do not retain orphan players',()=>{
 const{r,a,b}=duel();r.remove(b.id);assert.equal(r.players.length,1);r.finish(time);r.tick(time+RULES.roundBreak);assert.equal(r.phase,'waiting');r.remove(a.id);assert.equal(r.players.length,0);assert.equal(r.endAt,0);
});
