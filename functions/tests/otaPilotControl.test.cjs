'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pilotAllowed, pilotReleaseAllowed } = require('../otaPilotControl.cjs');
const appId = '1:1079648624157:android:abc123';
const control = { mode: 'beta', pilotUserIds: ['pilot'], androidAppId: appId };
test('pilot is fail-closed', () => {
  for (const value of [undefined, null, {}, { ...control, mode: 'disabled' }, { ...control, mode: 'stable' }, { ...control, pilotUserIds: ['bad/id'] }, { ...control, pilotUserIds: Array(6).fill('pilot') }]) assert.equal(pilotAllowed(value, 'pilot', 19, appId), false);
  assert.equal(pilotAllowed(control, 'pilot', 18, appId), false);
  assert.equal(pilotAllowed(control, 'other', 19, appId), false);
  assert.equal(pilotAllowed(control, 'pilot', 19, '1:1079648624157:web:abc123'), false);
  assert.equal(pilotAllowed({...control, androidAppId: undefined}, 'pilot', 19, appId), false);
  assert.equal(pilotAllowed(control, 'pilot', 19, appId), true);
});
test('pilot cannot receive stable, legacy, or untargeted release', () => {
  const release = { manifest: { channel: 'beta', minNativeCode: 19 }, targetUserIds: ['pilot'] };
  assert.equal(pilotReleaseAllowed(release, 'pilot'), true);
  assert.equal(pilotReleaseAllowed(release, 'other'), false);
  assert.equal(pilotReleaseAllowed({...release, manifest: {...release.manifest, channel: 'stable'}}, 'pilot'), false);
  assert.equal(pilotReleaseAllowed({...release, manifest: {...release.manifest, minNativeCode: 18}}, 'pilot'), false);
});
