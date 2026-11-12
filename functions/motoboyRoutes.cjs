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
const cfg = { region: 'southamerica-east1', secrets: [googleKey], maxInstances: 3, timeoutSeconds: 60, memory: '256MiB' };

async function authenticated(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Faça login.');
  const link = await db.doc(`auth_links/${request.auth.uid}`).get();
  const identity = link.data();
  if (!identity?.user_id || identity.active === false) throw new HttpsError('permission-denied', 'Conta inativa.');
  const userId = identity.user_id;
  const user = await db.doc(`users/${userId}`).get();
  if (!user.exists || user.data()?.active === false) throw new HttpsError('permission-denied', 'Usuário inativo.');
  return { userId, user: user.data(), identity };
}
async function authorized(request) {
  const { userId, user, identity } = await authenticated(request);
  const permission = await db.doc(`user_feature_permissions/motoboy_management__${userId}`).get();
  const allowed = identity.role === 'admin' || user.role === 'admin' || userId === 'emp-1' || permission.data()?.enabled === true;
  if (!allowed) throw new HttpsError('permission-denied', 'Sem permissão para planejar corridas.');
  return userId;
}
function boundedString(input, max = 160) { return typeof input === 'string' ? input.trim().slice(0, max) : ''; }
const placeIdValid = (x) => typeof x === 'string' && x.length >= 3 && x.length <= 250 && /^[\w:-]+$/.test(x);
async function google(url, body, fieldMask) {
  const headers = { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleKey.value() };
  if (fieldMask) headers['X-Goog-FieldMask'] = fieldMask;
  let response;
  try { response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) }); }
  catch { throw new HttpsError('unavailable', 'Google Maps indisponível. Tente novamente.'); }
  if (!response.ok) {
    // Nunca registrar a chave ou dados pessoais da solicitação nos logs.
    console.error('Google Maps API status', response.status);
    throw new HttpsError('failed-precondition', 'Google Routes/Places recusou a solicitação. Verifique API, faturamento e restrições da chave de servidor.');
  }
  return response.json();
}
const waypoint = (placeId, address) => placeIdValid(placeId) ? { placeId } : { address: boundedString(address, 400) };

exports.googleRoutePlanner = onCall(cfg, async (request) => {
  const action = request.data?.action;
  // Apenas o motoboy dono das corridas (ou gestor autorizado) pode obter o trajeto.
  if (action === 'draw') {
    const { userId, user, identity } = await authenticated(request);
    const rideId = boundedString(request.data?.rideId, 150);
    if (!rideId || rideId.includes('/')) throw new HttpsError('invalid-argument', 'Corrida inválida.');
    const first = await db.doc(`motoboy_assignments/${rideId}`).get();
    if (!first.exists) throw new HttpsError('not-found', 'Corrida não encontrada.');
    const main = first.data();
    const owner = main.assigned_to === userId;
    if (!owner) {
      const perm = await db.doc(`user_feature_permissions/motoboy_management__${userId}`).get();
      if (!(identity.role === 'admin' || user.role === 'admin' || userId === 'emp-1' || perm.data()?.enabled === true))
        throw new HttpsError('permission-denied', 'Corrida pertence a outro usuário.');
    }
    let stops = [main];
    if (main.route_id && typeof main.route_id === 'string') {
      const group = await db.collection('motoboy_assignments').where('route_id', '==', main.route_id).limit(25).get();
      stops = group.docs.map((doc) => doc.data()).filter((r) =>
        r.assigned_to === main.assigned_to && ['pending', 'accepted'].includes(r.status)
      ).sort((a, b) => (Number(a.route_order) || 999) - (Number(b.route_order) || 999));
    }
    if (!stops.length) return { polyline: '', distanceMeters: 0, count: 0 };
    if (stops.length > 20) throw new HttpsError('failed-precondition', 'Limite de 20 paradas por rota.');
    if (stops.some((s) => !s.destination_place_id && !boundedString(s.location, 400)))
      throw new HttpsError('failed-precondition', 'Uma entrega está sem endereço confirmado.');
    // Rota loja -> entregas -> loja. Não usa Directions API (Legacy).
    const result = await google('https://routes.googleapis.com/directions/v2:computeRoutes', {
      origin: { address: ORIGIN.address },
      destination: { address: ORIGIN.address },
      intermediates: stops.map((s) => waypoint(s.destination_place_id, s.location)),
      travelMode: 'DRIVE', languageCode: 'pt-BR', routingPreference: 'TRAFFIC_UNAWARE',
      polylineQuality: 'HIGH_QUALITY',
    }, 'routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration');
    const route = result.routes?.[0];
    if (!route?.polyline?.encodedPolyline) throw new HttpsError('unavailable', 'Google Routes não retornou o trajeto.');
    return { polyline: route.polyline.encodedPolyline, distanceMeters: route.distanceMeters || 0, count: stops.length };
  }
  const callerId = await authorized(request);
  if (action === 'autocomplete') {
    const input = boundedString(request.data?.input, 120);
    if (input.length < 3) return { suggestions: [] };
    const sessionToken = boundedString(request.data?.sessionToken, 60);
    const payload = { input, includedRegionCodes: ['br'], languageCode: 'pt-BR' };
    if (/^[a-zA-Z0-9-]{10,60}$/.test(sessionToken)) payload.sessionToken = sessionToken;
    const result = await google('https://places.googleapis.com/v1/places:autocomplete', payload, 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text');
    return { suggestions: (result.suggestions || []).filter((s) => s.placePrediction?.placeId).slice(0, 5).map((s) => ({ placeId: s.placePrediction.placeId, label: s.placePrediction.text?.text || '' })) };
  }
  if (action === 'details') {
    const placeId = boundedString(request.data?.placeId, 250);
    const token = boundedString(request.data?.sessionToken, 60);
    if (!placeIdValid(placeId)) throw new HttpsError('invalid-argument', 'Local inválido.');
    let response;
    try { response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=pt-BR${/^[a-zA-Z0-9-]{10,60}$/.test(token) ? `&sessionToken=${encodeURIComponent(token)}` : ''}`, {
      headers: { 'X-Goog-Api-Key': googleKey.value(), 'X-Goog-FieldMask': 'id,formattedAddress' }, signal: AbortSignal.timeout(12000),
    }); } catch { throw new HttpsError('unavailable', 'Places indisponível.'); }
    if (!response.ok) throw new HttpsError('failed-precondition', 'Não foi possível confirmar o endereço.');
    const result = await response.json();
    return { placeId: result.id, formattedAddress: result.formattedAddress || '' };
  }
  if (action === 'optimize') {
    const destinations = request.data?.destinations;
    if (!Array.isArray(destinations) || destinations.length < 2 || destinations.length > 20 || !destinations.every(placeIdValid))
      throw new HttpsError('invalid-argument', 'Selecione entre 2 e 20 destinos.');
    const originPlaceId = boundedString(request.data?.originPlaceId, 250);
    if (!placeIdValid(originPlaceId)) throw new HttpsError('failed-precondition', 'Configure o Place ID da Japan Imports.');
    const result = await google('https://routes.googleapis.com/directions/v2:computeRoutes', {
      origin: { placeId: originPlaceId }, destination: { placeId: originPlaceId },
      intermediates: destinations.map((placeId) => ({ placeId })),
      travelMode: 'DRIVE', optimizeWaypointOrder: true, languageCode: 'pt-BR',
    }, 'routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration');
    const route = result.routes?.[0];
    const order = route?.optimizedIntermediateWaypointIndex;
    if (!Array.isArray(order) || order.length !== destinations.length) throw new HttpsError('unavailable', 'Rota não retornou ordem válida.');
    return { order, distanceMeters: route.distanceMeters || 0, duration: route.duration || '', estimateIncludesReturn: true };
  }
  if (action === 'assign') {
    const motoboyId = boundedString(request.data?.motoboyId, 128);
    const stops = request.data?.stops;
    if (!motoboyId || !Array.isArray(stops) || !stops.length || stops.length > 20)
      throw new HttpsError('invalid-argument', 'Rota inválida (máximo 20 paradas).');
    if (stops.some((s) => !s || !boundedString(s.assignmentId, 150) || !placeIdValid(s.placeId) || !boundedString(s.address, 400) || !['normal', 'urgent'].includes(s.priority)))
      throw new HttpsError('invalid-argument', 'Confirme endereço e prioridade de todas as paradas.');
    const ids = stops.map((s) => s.assignmentId);
    if (new Set(ids).size !== ids.length || ids.some((id) => id.includes('/')))
      throw new HttpsError('invalid-argument', 'Corrida duplicada ou inválida.');
    const target = await db.doc(`users/${motoboyId}`).get();
    if (!target.exists || target.data()?.active === false || !(target.data()?.sectors || []).includes('motoboys'))
      throw new HttpsError('invalid-argument', 'Motoboy inválido.');
    const routeId = randomUUID();
    await db.runTransaction(async (tx) => {
      const refs = ids.map((id) => db.doc(`motoboy_assignments/${id}`));
      const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
      for (const snap of snaps) {
        const current = snap.data();
        if (!snap.exists || ![null, undefined, '', motoboyId].includes(current.assigned_to) || current.status !== 'pending' || current.route_id)
          throw new HttpsError('failed-precondition', 'Uma corrida já foi atribuída/iniciada ou alterada. Atualize a lista.');
      }
      refs.forEach((ref, i) => tx.update(ref, {
        assigned_to: motoboyId, assignee_id: motoboyId, sector: 'motoboys',
        route_id: routeId, route_order: i + 1, route_priority: stops[i].priority,
        destination_place_id: stops[i].placeId,
        location: boundedString(stops[i].address, 400),
        route_assigned_by: callerId, route_origin_address: ORIGIN.address,
        route_assigned_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(),
      }));
    });
    return { routeId, count: stops.length };
  }
  throw new HttpsError('invalid-argument', 'Ação desconhecida.');
});
