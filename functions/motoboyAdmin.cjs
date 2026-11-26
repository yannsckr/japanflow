'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const db = getFirestore();
const fail = (message) => { throw new HttpsError('invalid-argument', message); };
const id = (v) => { if (typeof v !== 'string' || !/^[\w-]{1,180}$/.test(v)) fail('Identificador inválido.'); return v; };
const dayOf = (d) => new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo', year:'numeric',month:'2-digit',day:'2-digit' }).format(d);
const stamp = (v) => { if (v === null) return null; if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)) fail('Horário inválido.'); const d = new Date(v); if (!Number.isFinite(d.getTime()) || d.toISOString() !== v || d.getTime() > Date.now() + 60000) fail('Horário inválido ou futuro.'); return Timestamp.fromDate(d); };
const km = v => { if (v === null) return null; if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 9999999) fail('Odômetro inválido.'); return Math.round(v * 10) / 10; };
const str = (v,max) => { if (typeof v !== 'string' || v.length > max) fail('Texto inválido.'); return v.trim(); };
const serial = v => v?.toDate ? v.toDate().toISOString() : v ?? null;
const project = (data, fields) => Object.fromEntries(fields.map(k => [k,serial(data?.[k])]));
const journeyFields = ['started_at','ended_at','lunch_started_at','lunch_ended_at','start_odometer','end_odometer','start_photo_path','end_photo_path','odometer_km','admin_corrected'];
const rideFields = ['client_name','location','assigned_to','assigned_at','accepted_at','completed_at','status','notes','ride_value','proof_url','route_id','assigned_by','admin_corrected','completion_source'];
const grantId = uid => `motoboy_management__${uid}`;
async function actor(request, tx) {
  const get = ref => tx ? tx.get(ref) : ref.get();
  if (!request.auth?.uid) throw new HttpsError('unauthenticated','Faça login.');
  const link = (await get(db.doc(`auth_links/${request.auth.uid}`))).data();
  if (!link?.user_id || link.active === false) throw new HttpsError('permission-denied','Conta inativa.');
  const uid = id(link.user_id);
  const [u,g] = await Promise.all([get(db.doc(`users/${uid}`)),get(db.doc(`user_feature_permissions/${grantId(uid)}`))]);
  const user = u.data(); const grant = g.data();
  const admin = link.role === 'admin';
  if (!user || user.active === false || !(admin || (grant?.enabled === true && grant.user_id === uid && grant.feature_key === 'motoboy_management'))) throw new HttpsError('permission-denied','Permissão de gestão de motoboys necessária.');
  return { uid, admin };
}
const revision = snap => snap.updateTime ? `${snap.updateTime.seconds}:${snap.updateTime.nanoseconds}` : '';
function checkRevision(snap, expected) { if (revision(snap) !== expected) throw new HttpsError('aborted','Registro alterado. Recarregue antes de salvar.'); }
function ordered(a,b) { return !a || !b || a.toMillis() <= b.toMillis(); }
exports.motoboyAdmin = onCall({region:'southamerica-east1', enforceAppCheck:true,maxInstances:4,timeoutSeconds:60}, async request => {
  const who = await actor(request); const input = request.data || {};
  if (input.action === 'permissions') {
    if (!who.admin) throw new HttpsError('permission-denied','Somente administradores.');
    const users = await db.collection('users').get(); const grants = await db.collection('user_feature_permissions').where('feature_key','==','motoboy_management').get();
    const enabled = new Set(grants.docs.filter(d=>d.data().enabled === true).map(d=>d.data().user_id));
    return {users:users.docs.filter(d=>d.data().active!==false).map(d=>({id:d.id,name:d.data().name || d.id,enabled:enabled.has(d.id)}))};
  }
  if (input.action === 'grant') {
    if (!who.admin) throw new HttpsError('permission-denied','Somente administradores.');
    const uid = id(input.userId); if (typeof input.enabled !== 'boolean') fail('Permissão inválida.');
    const reason = str(input.reason,500); if (reason.length<5) fail('Justificativa obrigatória.');
    const ref = db.doc(`user_feature_permissions/${grantId(uid)}`);
    await db.runTransaction(async tx=>{if(!(await actor(request,tx)).admin)throw new HttpsError('permission-denied','Somente administradores.');const [old,u]=await Promise.all([tx.get(ref),tx.get(db.doc(`users/${uid}`))]);if(!u.exists||u.data().active===false) fail('Usuário inativo.');const next={user_id:uid,feature_key:'motoboy_management',enabled:input.enabled};tx.set(ref,{...next,updated_at:FieldValue.serverTimestamp(),updated_by:who.uid},{merge:true});tx.create(db.collection('motoboy_admin_audit').doc(),{actor:who.uid,target:ref.path,reason,before:old.exists?project(old.data(),['enabled']):null,after:next,at:FieldValue.serverTimestamp()});});return {ok:true};
  }
  const uid = id(input.userId); const day = input.day;
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0,10)!==day || day>dayOf(new Date())) fail('Data inválida.');
  const user = (await db.doc(`users/${uid}`).get()).data(); if (!user?.sectors?.includes('motoboys')) fail('Motoboy inválido.');
  const journey = db.doc(`motoboy_journeys/${uid}_${day}`);
  if (input.action === 'load') {
    const [j,r] = await Promise.all([journey.get(),db.collection('motoboy_assignments').where('assigned_to','==',uid).get()]);
    const rides = r.docs.filter(d=>{const v=d.data();return [v.assigned_at,v.created_at,v.scheduled_for,v.accepted_at,v.completed_at].some(t=>{const s=serial(t);return typeof s==='string' && (s.length===10?s===day:Number.isFinite(Date.parse(s))&&dayOf(new Date(s))===day);});}).map(d=>({id:d.id,revision:revision(d),...project(d.data(),rideFields)}));
    return {admin:who.admin,journey:{revision:revision(j),...project(j.data(),journeyFields)},rides};
  }
  if (input.action === 'audit') {
    const target = input.rideId ? `motoboy_assignments/${id(input.rideId)}` : journey.path;
    if (input.rideId) { const ride = (await db.doc(target).get()).data(); if (!ride || ride.assigned_to !== uid) fail('Corrida inválida.'); }
    const items = await db.collection('motoboy_admin_audit').where('target','==',target).get();
    return {items:items.docs.map(d=>({id:d.id, ...d.data(),at:serial(d.data().at)})).sort((a,b)=>String(b.at).localeCompare(String(a.at)))};
  }
  const reason = str(input.reason,500); if (reason.length<5) fail('Justificativa obrigatória.');
  if (input.action === 'journey') {
    const p=input.values||{};const start=stamp(p.started_at),end=stamp(p.ended_at),ls=stamp(p.lunch_started_at),le=stamp(p.lunch_ended_at),a=km(p.start_odometer),b=km(p.end_odometer);
    if (!start || dayOf(start.toDate())!==day || a===null || (end && dayOf(end.toDate())!==day) || !ordered(start,end) || !ordered(start,ls) || !ordered(ls,le) || !ordered(le,end) || (ls&&dayOf(ls.toDate())!==day) || (le&&dayOf(le.toDate())!==day) || (le&&!ls) || (end&&ls&&!le) || (!!end !== (b!==null)) || (b!==null&&b<a)) fail('Confira horários, almoço e odômetros.');
    await db.runTransaction(async tx=>{await actor(request,tx);const old=await tx.get(journey);checkRevision(old,input.revision);if(old.data()?.ended_at&&!end)fail('Não é permitido reabrir uma jornada encerrada por esta ferramenta.');if(end&&!old.data()?.ended_at){const pending=await tx.get(db.collection('motoboy_assignments').where('assigned_to','==',uid).where('status','in',['pending','accepted']).limit(1));if(!pending.empty)throw new HttpsError('failed-precondition','Resolva as corridas pendentes antes de encerrar.');}const values={user_id:uid,day,started_at:start,ended_at:end,lunch_started_at:ls,lunch_ended_at:le,start_odometer:a,end_odometer:b,odometer_km:b===null?null:Math.round((b-a)*10)/10,admin_corrected:true,updated_at:FieldValue.serverTimestamp()};tx.set(journey,values,{merge:true});tx.create(db.collection('motoboy_admin_audit').doc(),{actor:who.uid,target:journey.path,reason,before:project(old.data(),journeyFields),after:project({...old.data(),...values},journeyFields),at:FieldValue.serverTimestamp()});});return {ok:true};
  }
  if (input.action === 'ride') {
    const ref=db.doc(`motoboy_assignments/${id(input.rideId)}`);const p=input.values||{};const assigned=stamp(p.assigned_at),accepted=stamp(p.accepted_at),completed=stamp(p.completed_at);const status=p.status;
    if(!['pending','accepted','completed','cancelled'].includes(status)||!ordered(assigned,accepted)||!ordered(assigned,completed)||!ordered(accepted,completed)||(status==='completed'&&!completed)||(status!=='completed'&&completed)||(status==='accepted'&&!accepted)||(status==='pending'&&accepted))fail('Confira situação e horários.');
    const client=str(p.client_name,180),location=str(p.location,450),notes=str(p.notes,10000);
    const value=p.ride_value;
    if(!client || (value!==null && (typeof value!=='number'||!Number.isFinite(value)||value<0||value>9999999))) fail('Nome e valor válidos são obrigatórios.');
    const targetId=id(p.assigned_to);
    await db.runTransaction(async tx=>{
      await actor(request,tx);
      const old=await tx.get(ref);checkRevision(old,input.revision);const v=old.data();
      if(!v||v.assigned_to!==uid||v.report_summary_only===true)fail('Corrida inválida.');
      const reassign=targetId!==uid;
      if(reassign){
        if(v.route_id||v.status!=='pending'||status!=='pending')fail('Redesignação manual somente para corrida individual pendente.');
        const target=(await tx.get(db.doc(`users/${targetId}`))).data();
        if(!target||target.active===false||!Array.isArray(target.sectors)||!target.sectors.includes('motoboys'))fail('Novo motoboy inválido.');
      }
      const taskRef=typeof v.task_id==='string' && v.task_id!==v.source_order_task_id && /^[\w-]{1,180}$/.test(v.task_id) ? db.doc(`tasks/${v.task_id}`) : null;
      const task=taskRef ? await tx.get(taskRef) : null;
      if(!reassign && v.assigned_at&&!assigned)fail('O horário de designação existente não pode ser apagado.');
      if(v.route_id&&location!==v.location)fail('Endereço de rota agrupada deve ser alterado pelo planejador.');
      const values={client_name:client,location,notes,ride_value:value===null?null:Math.round(value*100)/100,assigned_to:targetId,assigned_at:reassign?Timestamp.now():assigned,accepted_at:accepted,completed_at:completed,status,admin_corrected:true,updated_at:FieldValue.serverTimestamp()};
      if(reassign){values.assigned_by=who.uid;values.accepted_at=null;values.completed_at=null;}
      if(status==='completed' && (v.status!=='completed'||serial(v.completed_at)!==serial(completed)))values.completion_source='administrative';
      if(location!==v.location){values.expected_distance_meters=null;values.expected_return_meters=null;values.expected_distance_calculated_at=null;}
      if(taskRef && task?.exists && task.data().sector==='motoboys' && task.data().assignee_id===uid){
        tx.update(taskRef,{title:`🏍️ Corrida: ${client}`,description:[`Cliente: ${client}`,location?`Local: ${location}`:'',value!==null?`Valor: R$ ${value.toFixed(2)}`:''].filter(Boolean).join(' • '),assignee_id:targetId,updated_at:FieldValue.serverTimestamp()});
      }
      tx.update(ref,values);
      tx.create(db.collection('motoboy_admin_audit').doc(),{actor:who.uid,target:ref.path,reason,before:project(v,rideFields),after:project({...v,...values},rideFields),at:FieldValue.serverTimestamp()});
    });return {ok:true};
  }
  fail('Ação desconhecida.');
});
