export const RULES = { tickRate: 30, maxPlayers: 8, maxSpectators: 16, duration: 300_000, killLimit: 20, respawn: 3000, protection: 2000, roundBreak: 10_000, speed: 6, sprintSpeed: 8.5, radius: .36, eye: 1.6, jumpSpeed: 6, gravity: 18, magazine: 30, reload: 1800, fireInterval: 150, damage: 34, range: 100 } as const;
export const COLORS = ['#f5ad55', '#69c8d3', '#b5cf77', '#c697e0', '#ee7f85', '#8aaafa', '#f0d778', '#85d4b1'];
export const ARENA_SIZE = 64;
export interface Block { x: number; z: number; w: number; d: number; h: number; color: string }
export const BLOCKS: Block[] = [
 {x:-19,z:-19,w:12,d:5,h:3.2,color:'#456b69'}, {x:-3,z:-22,w:5,d:12,h:3.2,color:'#986344'},
 {x:15,z:-20,w:12,d:5,h:3.2,color:'#626b58'}, {x:22,z:-6,w:5,d:12,h:3.2,color:'#466575'},
 {x:18,z:13,w:12,d:5,h:3.2,color:'#986344'}, {x:1,z:21,w:5,d:12,h:3.2,color:'#456b69'},
 {x:-17,z:20,w:12,d:5,h:3.2,color:'#626b58'}, {x:-23,z:3,w:5,d:12,h:3.2,color:'#986344'},
 {x:-7,z:-5,w:9,d:4,h:3.2,color:'#466575'}, {x:7,z:6,w:9,d:4,h:3.2,color:'#456b69'},
 {x:10,z:-7,w:3,d:3,h:1.4,color:'#9d8864'}, {x:-9,z:8,w:3,d:3,h:1.4,color:'#9d8864'},
 {x:-1,z:1,w:2.5,d:2.5,h:1.4,color:'#9d8864'}
];
