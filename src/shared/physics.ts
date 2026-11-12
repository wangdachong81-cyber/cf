import { ARENA_SIZE, BLOCKS, RULES } from './config';
import type { Body, Input } from './protocol';
export function freeAt(x:number,z:number,r:number=RULES.radius) {
 const edge=ARENA_SIZE/2-r;
 return Math.abs(x)<=edge && Math.abs(z)<=edge && !BLOCKS.some(b=>Math.abs(x-b.x)<b.w/2+r && Math.abs(z-b.z)<b.d/2+r);
}
export function move(body:Body,input:Input,dt:number) {
 const length=Math.hypot(input.forward,input.strafe)||1;
 const speed=input.sprint?RULES.sprintSpeed:RULES.speed;
 const f=input.forward/Math.max(1,length), s=input.strafe/Math.max(1,length);
 const dx=(Math.cos(input.yaw)*s-Math.sin(input.yaw)*f)*speed*dt;
 const dz=(-Math.sin(input.yaw)*s-Math.cos(input.yaw)*f)*speed*dt;
 if(freeAt(body.x+dx,body.z)) body.x+=dx;
 if(freeAt(body.x,body.z+dz)) body.z+=dz;
 if(input.jump && body.y<=0) body.vy=RULES.jumpSpeed;
 body.vy-=RULES.gravity*dt; body.y+=body.vy*dt;
 if(body.y<0){body.y=0;body.vy=0;}
}
export function direction(yaw:number,pitch:number):[number,number,number] { return [-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)]; }
export function rayBox(origin:number[],dir:number[],min:number[],max:number[]) {
 let near=0,far=Infinity;
 for(let i=0;i<3;i++){
  if(Math.abs(dir[i])<1e-8){if(origin[i]<min[i]||origin[i]>max[i])return Infinity;continue;}
  const a=(min[i]-origin[i])/dir[i],b=(max[i]-origin[i])/dir[i];
  near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
  if(near>far)return Infinity;
 }
 return far<0?Infinity:near;
}
export function wallDistance(origin:number[],dir:number[]){
 let distance:number=RULES.range;
 for(const b of BLOCKS) distance=Math.min(distance,rayBox(origin,dir,[b.x-b.w/2,0,b.z-b.d/2],[b.x+b.w/2,b.h,b.z+b.d/2]));
 // Match the visible perimeter fence collision.
 const wall=ARENA_SIZE/2;
 for(const [min,max] of [ [[-wall-1,0,-wall-1],[-wall,5,wall+1]], [[wall,0,-wall-1],[wall+1,5,wall+1]], [[-wall,0,-wall-1],[wall,5,-wall]], [[-wall,0,wall],[wall,5,wall+1]] ]) distance=Math.min(distance,rayBox(origin,dir,min,max));
 return distance;
}
