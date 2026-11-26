'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildReportEvent } = require('../motoboyRideReportHistoryCore.cjs');
const pending = { assigned_to: null, status: 'pending', client_name: 'Cliente' };
const assigned = { ...pending, assigned_to: 'rider-1', assigned_at: '2026-11-26T11:10:00Z' };
test('assignment generates deterministic event with exact server timestamp', () => {
  const a = buildReportEvent('ride-1', 'event-1', pending, assigned);
  assert.equal(a.value.after.assigned_at, '2026-11-26T11:10:00.000Z');
  assert.equal(a.id, buildReportEvent('ride-1', 'event-1', pending, assigned).id);
  assert.notEqual(a.id, buildReportEvent('ride-1', 'event-2', pending, assigned).id);
});
test('deletion preserves previous assigned ride, completion and client data', () => {
  const completed = { ...assigned, status: 'completed', completed_at: '2026-11-26T12:00:00Z', proof_url: 'private', start_photo_path: 'private' };
  const a = buildReportEvent('ride-1', 'delete', completed, undefined);
  assert.equal(a.value.before.status, 'completed');
  assert.equal(a.value.before.completed_at, '2026-11-26T12:00:00.000Z');
  assert.equal(a.value.after, null);
  assert.equal(a.value.before.proof_url, undefined);
  assert.equal(a.value.before.start_photo_path, undefined);
});
test('irrelevant changes do not create history; reassignment does', () => {
  assert.equal(buildReportEvent('ride-1', 'distance', assigned, { ...assigned, expected_distance_meters: 500 }).value.after.expected_distance_meters, 500);
  assert.equal(buildReportEvent('ride-1', 'gps', assigned, { ...assigned, gps: 500 }), null);
  assert.equal(buildReportEvent('ride-1', 'pending', null, pending), null);
  const change = buildReportEvent('ride-1', 'reassign', assigned, { ...assigned, assigned_to: 'rider-2' });
  assert.equal(change.value.before.assigned_to, 'rider-1');
  assert.equal(change.value.after.assigned_to, 'rider-2');
});
