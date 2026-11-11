 'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { randomUUID } = require('node:crypto');
const db = getFirestore();
const googleKey = defineSecret('GOOGLE_MAPS_SERVER_KEY');
const ORIGIN = Object.freeze({
  name: 'Japan Imports',
  address: 'Av. das Rosas, 111 - Loja - Jardim Motorama, São José dos Campos - SP, 12224-000',
});
const cfg = { region:'southamerica-east1', secrets:[googleKey], maxInstances:3, timeoutSeconds:60, memory:'256MiB' };

async function authorized(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Faça login.');
  const link = await db.doc(`auth_links/${request.auth.uid}`).get();
  const identity = link.data();
  if (!identity?.user_id || identity.active === false) throw new HttpsError('permission-denied', 'Conta inativa.');
  const userId = identity.user_id;
  const [user, permission] = await Promise.all([
    db.doc(`users/${userId}`).get(),
    db.doc(`user_feature_permissions/motoboy_management__${userId}`).get(),
  ]);
  if (!user.exists || user.data()?.active === false) throw new HttpsError('permission-denied', 'Usuário inativo.');
  const sectors = user.data()?.sectors || [];
  const allowed = identity.role === 'admin' || user.data()?.role === 'admin' || userId === 'emp-1' || permission.data()?.enabled === true;
  if (!allowed) throw new HttpsError('permission-denied', 'Sem permissão para planejar corridas.');
  return userId;
}
function boundedString(input,max=160) {return typeof input === 'string' ? input.trim().slice(0,max) : '';}
async function google(url,body,fieldMask) {
  const headers = {'Content-Type':'application/json','X-Goog-Api-Key':googleKey.value()};
  if(fieldMask) headers['X-Goog-FieldMask']=fieldMask;
  let response;
  try { response=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(12000)}); }
  catch { throw new HttpsError('unavailable','Google Maps indisponível. Tente novamente.'); }
  if(!response.ok) {console.error('Google Maps API status',response.status);throw new HttpsError('failed-precondition','Não foi possível consultar Google Maps. Verifique API, faturamento e chave.');}
  return response.json();
}
const placeIdValid = x => typeof x === 'string' && x.length >= 3 && x.length <= 250 && /^[\w:-]+$/.test(x);

exports.googleRoutePlanner = onCall(cfg, async request => {
  const action=request.data?.action;
  // draw: motoboy pode consultar SOMENTE suas corridas. A chave Google fica no servidor.
  // Não exige motoboy_management, reservado ao gestor para atribuição e otimização.
  if (action === 'draw') {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Faça login.');
    const link = await db.doc(`auth_links/${request.auth.uid}`).get();
    const identity = link.data();
    if (!identity?.user_id || identity.active === false)
      throw new HttpsError('permission-denied', 'Conta inativa.');
    const callerId = identity.user_id;
    const user = await db.doc(`users/${callerId}`).get();
    if (!user.exists || user.data()?.active === false)
      throw new HttpsError('permission-denied', 'Usuário inativo.');
    const rideId = boundedString(request.data?.rideId, 150);
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(rideId))
      throw new HttpsError('invalid-argument', 'Corrida inválida.');
    const ride = await db.doc(`motoboy_assignments/${rideId}`).get();
    if (!ride.exists) throw new HttpsError('not-found', 'Corrida não encontrada.');
    const data = ride.data();
    const canManage = identity.role === 'admin' || user.data()?.role === 'admin' ||
      callerId === 'emp-1' ||
      (await db.doc(`user_feature_permissions/motoboy_management__${callerId}`).get()).data()?.enabled === true;
    if (data.assigned_to !== callerId && !canManage)
      throw new HttpsError('permission-denied', 'Corrida não atribuída a você.');
    if (!['pending', 'accepted'].includes(data.status))
      throw new HttpsError('failed-precondition', 'Corrida fora da rota ativa.');
    const routeId = typeof data.route_id === 'string' ? data.route_id : '';
    let stops = [data];
    if (routeId) {
      const snapshot = await db.collection('motoboy_assignments')
        .where('assigned_to', '==', data.assigned_to).get();
      stops = snapshot.docs.map(d => d.data()).filter(d =>
        d.route_id === routeId && ['pending', 'accepted'].includes(d.status));
      stops.sort((a, b) => (a.route_order || 9999) - (b.route_order || 9999));
    }
    if (!stops.length || stops.length > 20)
      throw new HttpsError('failed-precondition', 'Rota indisponível.');
    const waypoint = (item) => {
      const placeId = boundedString(item.destination_place_id, 250);
      if (placeIdValid(placeId)) return {placeId};
      const address = boundedString(item.location, 400);
      return address ? {address} : null;
    };
    const points = stops.map(waypoint);
    if (points.some(p => !p))
      throw new HttpsError('failed-precondition', 'Defina endereços válidos para todas as entregas.');
    const payload = {
      origin: {address: ORIGIN.address},
      destination: points[points.length - 1],
      ...(points.length > 1 ? {intermediates: points.slice(0, -1)} : {}),
      travelMode: 'DRIVE', languageCode: 'pt-BR',
    };
    const response = await google('https://routes.googleapis.com/directions/v2:computeRoutes',
      payload, 'routes.polyline.encodedPolyline,routes.distanceMeters');
    const result = response.routes?.[0];
    if (!result?.polyline?.encodedPolyline)
      throw new HttpsError('unavailable', 'Trajeto indisponível para os endereços informados.');
    return {polyline: result.polyline.encodedPolyline, distanceMeters: result.distanceMeters || 0};
  }
  const callerId=await authorized(request);
  if(action==='autocomplete') {
    const input=boundedString(request.data?.input,120);
    if(input.length<3) return {suggestions:[]};
    const sessionToken=boundedString(request.data?.sessionToken,60);
    const payload={input, includedRegionCodes:['br'], languageCode:'pt-BR'};
    if(sessionToken && /^[a-zA-Z0-9-]{10,60}$/.test(sessionToken)) payload.sessionToken=sessionToken;
    const result=await google('https://places.googleapis.com/v1/places:autocomplete',payload,'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text');
    return {suggestions:(result.suggestions||[]).filter(s=>s.placePrediction?.placeId).slice(0,5).map(s=>({placeId:s.placePrediction.placeId,label:s.placePrediction.text?.text||''}))};
  }
  if(action==='details') {
    const placeId=boundedString(request.data?.placeId,250);
    const token=boundedString(request.data?.sessionToken,60); 
    if(!placeIdValid(placeId)) throw new HttpsError('invalid-argument','Local inválido.');
    // GET place details; no storage of Google geocoding coordinates.
    const response=await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=pt-BR${/^[a-zA-Z0-9-]{10,60}$/.test(token) ? `&sessionToken=${encodeURIComponent(token)}` : ""}`,{
      headers:{'X-Goog-Api-Key':googleKey.value(),'X-Goog-FieldMask':'id,formattedAddress'},
      signal:AbortSignal.timeout(12000),
    });
    if(!response.ok) throw new HttpsError('failed-precondition','Não foi possível confirmar o endereço.');
    const result=await response.json();
    return {placeId:result.id,formattedAddress:result.formattedAddress||''};
  }
  if(action==='optimize') {
    const destinations=request.data?.destinations;
    if(!Array.isArray(destinations)||destinations.length<2||destinations.length>20||!destinations.every(placeIdValid)) throw new HttpsError('invalid-argument','Selecione entre 2 e 20 destinos.');
    const originPlaceId=boundedString(request.data?.originPlaceId,250);
    if(!placeIdValid(originPlaceId)) throw new HttpsError('failed-precondition','Configure o Place ID da Japan Imports.');
    // Return to the store only for route-order optimization; ETA includes this return trip.
    const waypoints=destinations.map(placeId=>({placeId}));
    const result=await google('https://routes.googleapis.com/directions/v2:computeRoutes',{
      origin:{placeId:originPlaceId},destination:{placeId:originPlaceId}, intermediates:waypoints,
      travelMode:'DRIVE',optimizeWaypointOrder:true,languageCode:'pt-BR',
    },'routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration');
    const route=result.routes?.[0];
    const order=route?.optimizedIntermediateWaypointIndex;
    if(!Array.isArray(order)||order.length!==destinations.length) throw new HttpsError('unavailable','Rota não retornou ordem válida.');
    return {order,distanceMeters:route.distanceMeters||0,duration:route.duration||'',estimateIncludesReturn:true};
  }
  if(action==='assign') {
    const motoboyId=boundedString(request.data?.motoboyId,128);
    const stops=request.data?.stops;
    if(!motoboyId||!Array.isArray(stops)||!stops.length||stops.length>20) throw new HttpsError('invalid-argument','Rota inválida (máximo 20 paradas).');
    if(stops.some(s=>!s || !boundedString(s.assignmentId,150)||!placeIdValid(s.placeId)||!boundedString(s.address,400))) throw new HttpsError('invalid-argument','Confirme o endereço Google de todas as paradas.');
    const ids=stops.map(s=>s.assignmentId);
    if(new Set(ids).size!==ids.length) throw new HttpsError('invalid-argument','Corrida duplicada na rota.');
    const target=await db.doc(`users/${motoboyId}`).get();
    if(!target.exists||target.data()?.active===false||!(target.data()?.sectors||[]).includes('motoboys')) throw new HttpsError('invalid-argument','Motoboy inválido.');
    const routeId=randomUUID();
    await db.runTransaction(async tx=>{
      const refs=ids.map(id=>db.doc(`motoboy_assignments/${id}`));
      const snaps=await Promise.all(refs.map(ref=>tx.get(ref)));
      for(const snap of snaps){
        if(!snap.exists || (snap.data()?.assigned_to && snap.data()?.assigned_to!==motoboyId) || snap.data()?.status!=='pending') throw new HttpsError('failed-precondition','Uma corrida foi alterada. Atualize a lista e tente novamente.');
      }
      refs.forEach((ref,i)=>tx.update(ref,{
        assigned_to:motoboyId, route_id:routeId, route_order:i+1, destination_place_id:stops[i].placeId,
        location:boundedString(stops[i].address,400),route_assigned_by:callerId,
        route_origin_address:ORIGIN.address,route_assigned_at:FieldValue.serverTimestamp(),updated_at:FieldValue.serverTimestamp(),
      }));
    });
    return {routeId,count:stops.length};
  }
  throw new HttpsError('invalid-argument','Ação desconhecida.');
});
