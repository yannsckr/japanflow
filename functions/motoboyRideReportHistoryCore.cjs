'use strict';
const { createHash } = require('node:crypto');

const string = (value, max = 1000) => typeof value === 'string' ? value.slice(0, max) : '';
const iso = value => {
  try {
    const date = value?.toDate ? value.toDate() : typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch { return null; }
};
function projection(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    assigned_to: string(value.assigned_to, 180) || null,
    assigned_at: iso(value.assigned_at),
    created_at: typeof value.created_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.created_at) ? value.created_at : iso(value.created_at),
    scheduled_for: typeof value.scheduled_for === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.scheduled_for) ? value.scheduled_for : iso(value.scheduled_for),
    completed_at: iso(value.completed_at),
    status: string(value.status, 80),
    client_name: string(value.client_name),
    description: string(value.description),
    location: string(value.location),
    source_order_task_id: string(value.source_order_task_id, 180),
    report_summary_only: value.report_summary_only === true,
  };
}
function buildReportEvent(rideId, eventId, before, after) {
  if (typeof rideId !== 'string' || !rideId || typeof eventId !== 'string' || !eventId) throw new Error('Missing report event identity');
  const old = projection(before);
  const next = projection(after);
  // Ignore route distance, GPS, task links, proofs and other irrelevant updates.
  if (JSON.stringify(old) === JSON.stringify(next)) return null;
  if (!old?.assigned_to && !next?.assigned_to) return null;
  return {
    id: createHash('sha256').update(JSON.stringify([rideId, eventId])).digest('hex'),
    value: { ride_id: rideId, before: old, after: next },
  };
}
module.exports = { projection, buildReportEvent };
