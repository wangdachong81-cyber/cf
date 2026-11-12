import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import type { ServerMessage, Snapshot } from '../src/shared/protocol';
function next(ws:WebSocket,check:(m:ServerMessage)=>boolean):Promise<ServerMessage>{
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.off('message',read);reject(Error('WebSocket response timeout'));},4000);function read(data:unknown){const msg=JSON.parse(String(data)) as ServerMessage;if(check(msg)){clearTimeout(timer);ws.off('message',read);resolve(msg);}}ws.on('message',read);});
}
test('real clients can create, join, spectate, move and leave a room', {timeout:15000},async()=>{
 const child=spawn(process.execPath,['--import','tsx','src/server/index.ts'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
 const clients:WebSocket[]=[];
 try{
  const base=await new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server did not start')),5000);child.stdout.on('data',data=>{const match=String(data).match(/http:\/\/localhost:(\d+)/);if(match){clearTimeout(timer);resolve(`http://127.0.0.1:${match[1]}`);}});child.on('error',reject);});
  const connect=async()=>{const ws=new WebSocket(base.replace('http','ws')+'/ws');clients.push(ws);await once(ws,'open');return ws;};
  const a=await connect();const welcome=next(a,m=>m.type==='welcome');a.send(JSON.stringify({type:'join',name:'创建者',role:'player',create:true}));const created=await welcome;assert.equal(created.type,'welcome');if(created.type!=='welcome')return;
  const b=await connect();const joining=next(b,m=>m.type==='welcome');b.send(JSON.stringify({type:'join',name:'对手',role:'player',room:created.room}));await joining;
  const spectator=await connect();const spectating=next(spectator,m=>m.type==='welcome');spectator.send(JSON.stringify({type:'join',name:'观察员',role:'spectator',room:created.room}));await spectating;
  const state=await next(spectator,m=>m.type==='state'&&m.players.length===2&&m.spectators===1&&m.phase==='playing') as Snapshot;assert.equal(state.phase,'playing');assert.equal(state.players.length,2);
  const acknowledged=next(a,m=>m.type==='state'&&m.players.some(p=>p.id===created.id&&p.ack===1));a.send(JSON.stringify({type:'input',input:{seq:1,forward:1,strafe:0,yaw:0,pitch:0,jump:false,sprint:false,fire:false,reload:false}}));await acknowledged;
  const list=await fetch(base+'/api/rooms').then(r=>r.json()) as {code:string;players:number;spectators:number}[];assert.deepEqual(list.map(r=>[r.code,r.players,r.spectators]),[[created.room,2,1]]);
  const departed=next(a,m=>m.type==='state'&&m.players.length===1);b.close();await departed;
  const cleanup=next(spectator,m=>m.type==='state'&&m.players.length===0&&m.phase==='waiting');a.close();await cleanup;
  const invalid=await connect();const error=next(invalid,m=>m.type==='error');invalid.send(JSON.stringify({type:'join',name:'访客',role:'player',room:'000000'}));assert.equal((await error).type,'error');
 }finally{for(const ws of clients)ws.terminate();child.kill('SIGTERM');await once(child,'exit');}
});
