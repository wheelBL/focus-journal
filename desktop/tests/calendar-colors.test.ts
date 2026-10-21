import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Task,Session} from '../core/types';
import {calendarItemColors,calendarPalette,unassignedCalendarColor} from '../src/calendar-colors';
const task=(id:string,extra:Partial<Task>={}):Task=>({id,title:id,eventAt:'2026-10-20T09:00:00',...extra} as Task);

test('item colors avoid collisions until the palette is used and stay stable through reorder, additions and reload',()=>{
 const tasks=Array.from({length:24},(_,i)=>task(`id-${i}`)),first=calendarItemColors({tasks,sessions:[]});
 assert.equal(new Set(tasks.map(t=>first.color(t.id).accent)).size,24);
 const next=calendarItemColors({tasks:[task('new'),...tasks.slice().reverse().map(t=>({...t,title:'renamed',parentId:'new'}))],sessions:[]},JSON.parse(JSON.stringify(first.book)));
 for(const t of tasks)assert.deepEqual(next.color(t.id),first.color(t.id));
 assert.equal(calendarItemColors({tasks,sessions:[]},next.book).changed,false);
 const counts=Object.values(next.book).reduce((n,value)=>(n[value]=(n[value]??0)+1,n),{} as Record<number,number>);
 assert.equal(Math.max(...Object.values(counts)),2);
});

test('the first few distinct items use visibly separated hues, not merely unequal color strings',()=>{
 const tasks=['one','two','three','four'].map(id=>task(id)),colors=calendarItemColors({tasks,sessions:[]});
 const hues=tasks.map(t=>Number(colors.color(t.id).accent.match(/\d+/)![0]));
 for(let i=0;i<hues.length;i++)for(let j=i+1;j<hues.length;j++){const delta=Math.abs(hues[i]-hues[j]);assert.ok(Math.min(delta,360-delta)>=60);}
});

test('different entry sources use owner identity, recurring successors keep series color and unassigned effort stays neutral',()=>{
 const tasks=[task('a'),task('b'),task('a-next',{recurrencePreviousId:'a'})],sessions=[{id:'timed',taskId:'a'},{id:'manual',taskId:'a',manual:true},{id:'free',taskId:null}] as Session[];
 const colors=calendarItemColors({tasks,sessions});assert.deepEqual(colors.color('a'),colors.color('a-next'));assert.notDeepEqual(colors.color('a'),colors.color('b'));assert.deepEqual(colors.color(null),unassignedCalendarColor);
 const assigned=calendarItemColors({tasks,sessions:sessions.map(s=>s.id==='free'?{...s,taskId:'a'}:s)},colors.book);assert.deepEqual(assigned.color('a'),colors.color('a'));
 assert.deepEqual(calendarItemColors({tasks:[],sessions},colors.book).color('a'),colors.color('a'));
});

test('invalid saved palette entries are discarded and generated text meets normal text contrast',()=>{
 const colors=calendarItemColors({tasks:[task('a')],sessions:[]},{'item:a':99,'item:b':-2,other:1});assert.equal(Object.keys(colors.book).length,1);assert.ok(Object.values(colors.book).every(n=>n>=0&&n<24));
 const luminance=(css:string)=>{const [h,s,l]=css.match(/[\d.]+/g)!.map(Number),sat=s/100,light=l/100,a=sat*Math.min(light,1-light);const rgb=[0,8,4].map(n=>{const k=(n+h/30)%12,c=light-a*Math.max(-1,Math.min(k-3,9-k,1));return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
 for(const color of calendarPalette)assert.ok((luminance(color.fill)+.05)/(luminance(color.text)+.05)>=4.5);
});
