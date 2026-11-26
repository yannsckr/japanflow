'use strict';
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { buildReportEvent } = require('./motoboyRideReportHistoryCore.cjs');

// Firestore events are at-least-once and may arrive out of order. Persist a
// deterministic immutable event, not a mutable counter. The report sorts events.
exports.motoboyRideReportHistory = onDocumentWritten(
  { document: 'motoboy_assignments/{rideId}', region: 'southamerica-east1', maxInstances: 5, retry: true },
  async event => {
    const before = event.data?.before;
    const after = event.data?.after;
    const record = buildReportEvent(event.params.rideId, event.id, before?.data(), after?.data());
    if (!record) return;
    const eventAt = after?.exists && after.updateTime ? after.updateTime : Timestamp.fromDate(new Date(event.time));
    const ref = getFirestore().collection('motoboy_ride_report_events').doc(record.id);
    try {
      await ref.create({ ...record.value, event_at: eventAt });
    } catch (error) {
      if (error?.code !== 6 && error?.code !== 'already-exists') throw error;
    }
  }
);
