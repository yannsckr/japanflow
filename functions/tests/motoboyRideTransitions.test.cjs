"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { isJourneyOpen, isValidRideTransition } = require('../motoboyRideTransitionsCore.cjs');

test('jornada aberta e sem almoço pendente', () => {
  assert.equal(isJourneyOpen({ started_at: 1, ended_at: null }), true);
  assert.equal(isJourneyOpen({ started_at: 1, lunch_started_at: 1 }), false);
  assert.equal(isJourneyOpen({ started_at: 1, lunch_started_at: 1, lunch_ended_at: 2 }), true);
  assert.equal(isJourneyOpen({ started_at: 1, ended_at: 2 }), false);
  assert.equal(isJourneyOpen(null), false);
});
test('transicoes exigem titular e estado correto', () => {
  assert.equal(isValidRideTransition({ assigned_to: 'r1', status: 'pending' }, 'r1', 'start'), true);
  assert.equal(isValidRideTransition({ assigned_to: 'r1', status: 'pending' }, 'r2', 'start'), false);
  assert.equal(isValidRideTransition({ assigned_to: 'r1', status: 'accepted' }, 'r1', 'finish'), true);
  assert.equal(isValidRideTransition({ assigned_to: 'r1', status: 'completed' }, 'r1', 'finish'), false);
});
