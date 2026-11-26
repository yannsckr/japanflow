'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
class Timestamp {
  constructor(date) { this.date = date; this.seconds = Math.floor(date.getTime()/1000); this.nanoseconds = (date.getTime()%1000)*1000000; }
  static fromDate(date) { return new Timestamp(date); }
  static now() { return new Timestamp(new Date()); }
  toDate() { return this.date; }
  toMillis() { return this.date.getTime(); }
}
class HttpsError extends Error { constructor(code,message) { super(message);this.code=code; } }
const store=new Map();let counter=0;
const set=(path,data)=>store.set(path,{data,rev:++counter});
const snapshot=path=>{const x=store.get(path);return {id:path.split('/').pop(),exists:!!x,data:()=>x?.data,updateTime:x?{seconds:x.rev,nanoseconds:0}:undefined};};
const doc=path=>({path,get:async()=>snapshot(path)});
const collection=(path,filters=[],max=Infinity)=>({
  path,doc:(id)=>doc(`${path}/${id||'audit-'+(++counter)}`),
  where:(k,op,v)=>collection(path,[...filters,[k,op,v]],max),limit:n=>collection(path,filters,n),
  get:async()=>{const docs=[...store.keys()].filter(k=>k.startsWith(path+'/')&&k.split('/').length===2).map(snapshot).filter(s=>filters.every(([k,op,v])=>op==='in'?v.includes(s.data()[k]):s.data()[k]===v)).slice(0,max);return {docs,empty:docs.length===0};}
});
const db={doc,collection,runTransaction:async fn=>{const writes=[];const tx={get:r=>r.get(),set:(r,v,o)=>writes.push(()=>set(r.path,o?.merge?{...store.get(r.path)?.data,...v}:v)),update:(r,v)=>writes.push(()=>set(r.path,{...store.get(r.path)?.data,...v})),create:(r,v)=>writes.push(()=>set(r.path,v))};await fn(tx);writes.forEach(f=>f());}};
const original=Module._load;let handler;
try {
  Module._load=function(name,...args){if(name==='firebase-functions/v2/https')return {onCall:(_,fn)=>fn,HttpsError};if(name==='firebase-admin/firestore')return {getFirestore:()=>db,Timestamp,FieldValue:{serverTimestamp:()=>Timestamp.now()}};return original.call(this,name,...args);};
  handler=require('../motoboyAdmin.cjs').motoboyAdmin;
} finally {Module._load=original;}
const day='2025-11-26';
const at=hour=>`${day}T${hour}:00:00.000Z`;
const invoke=(uid,data)=>handler({auth:{uid},data});
function seed(){store.clear();counter=0;for(const [uid,role,sectors] of [['admin','admin',['ti']],['manager','employee',['expedicao']],['outsider','employee',['vendas']],['rider','employee',['motoboys']],['other','employee',['motoboys']]]){set(`auth_links/${uid}`,{user_id:uid,role,active:true});set(`users/${uid}`,{name:uid,role,sectors,active:true});}set('user_feature_permissions/motoboy_management__manager',{user_id:'manager',feature_key:'motoboy_management',enabled:true});}
const journey={started_at:at('11'),ended_at:at('21'),lunch_started_at:null,lunch_ended_at:null,start_odometer:100,end_odometer:120};
const base={userId:'rider',day,reason:'Correção conferida'};
const audits=()=>[...store.keys()].filter(k=>k.startsWith('motoboy_admin_audit/'));
test('explicit manager permission required, administrator can grant it with audit',async()=>{seed();await assert.rejects(invoke('outsider',{action:'load',...base}),{code:'permission-denied'});await assert.rejects(invoke('manager',{action:'grant',userId:'outsider',enabled:true,reason:'Conceder acesso'}),{code:'permission-denied'});await invoke('admin',{action:'grant',userId:'outsider',enabled:true,reason:'Conceder acesso'});assert.equal(audits().length,1);assert.ok((await invoke('outsider',{action:'load',...base})).journey);});
test('manual journey creation recalculates odometer and rejects stale revisions',async()=>{seed();await invoke('manager',{action:'journey',...base,revision:'',values:journey});const j=store.get(`motoboy_journeys/rider_${day}`).data;assert.equal(j.odometer_km,20);assert.equal(j.admin_corrected,true);assert.equal(audits().length,1);await assert.rejects(invoke('manager',{action:'journey',...base,revision:'',values:journey}),{code:'aborted'});});
test('cannot close a journey while an active delivery is pending',async()=>{seed();set('motoboy_assignments/a',{assigned_to:'rider',status:'pending',created_at:Timestamp.fromDate(new Date(at('11')))});await assert.rejects(invoke('manager',{action:'journey',...base,revision:'',values:journey}),{code:'failed-precondition'});assert.equal(audits().length,0);});
test('manual completion preserves original proof and records administrative source',async()=>{seed();set('motoboy_assignments/a',{assigned_to:'rider',status:'pending',assigned_at:Timestamp.fromDate(new Date(at('12'))),client_name:'A',location:'B',proof_url:'original',ride_value:15,created_at:Timestamp.fromDate(new Date(at('11')))});const loaded=await invoke('manager',{action:'load',...base});await invoke('manager',{action:'ride',...base,rideId:'a',revision:loaded.rides[0].revision,values:{assigned_to:'rider',assigned_at:at('12'),accepted_at:null,completed_at:at('14'),status:'completed',client_name:'A',location:'B',notes:'Conferido',ride_value:15}});const r=store.get('motoboy_assignments/a').data;assert.equal(r.status,'completed');assert.equal(r.completion_source,'administrative');assert.equal(r.proof_url,'original');assert.equal(audits().length,1);});
