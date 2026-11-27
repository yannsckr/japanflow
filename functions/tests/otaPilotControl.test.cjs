'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pilotAllowed, pilotReleaseAllowed } = require('../otaPilotControl.cjs');
const appId = '1:1079648624157:android:abc123';
const control = { mode: 'stable', androidAppId: appId, pilotUserIds: [] };
test('Stable accepts all valid motoboy IDs on compatible native builds', () => {
  for (const id of ['emp-13','emp-14','emp-15','emp-16','emp-17','emp-18'])
    assert.equal(pilotAllowed(control, id, 20, appId), true);
  assert.equal(pilotAllowed(control, 'emp-13', 21, appId), true);
});
test('Stable is fail closed', () => {
  for (const value of [undefined, null, {}, {...control,mode:'disabled'}, {...control,mode:'beta'}, {...control,androidAppId:undefined}])
    assert.equal(pilotAllowed(value,'emp-13',20,appId),false);
  for (const code of [18,19,NaN,20.1,'20']) assert.equal(pilotAllowed(control,'emp-13',code,appId),false);
  assert.equal(pilotAllowed(control,'emp-13',20,'1:1079648624157:web:abc123'),false);
  assert.equal(pilotAllowed(control,'bad/id',20,appId),false);
});
test('Stable only accepts unrestricted Stable releases for native 20+', () => {
  const r = {manifest:{channel:'stable',minNativeCode:20},targetUserIds:[]};
  assert.equal(pilotReleaseAllowed(r,'emp-13'),true);
  assert.equal(pilotReleaseAllowed(r,'emp-99'),true);
  assert.equal(pilotReleaseAllowed({...r,targetUserIds:['emp-13']},'emp-13'),false);
  assert.equal(pilotReleaseAllowed({...r,manifest:{...r.manifest,channel:'beta'}},'emp-13'),false);
  assert.equal(pilotReleaseAllowed({...r,manifest:{...r.manifest,minNativeCode:19}},'emp-13'),false);
  assert.equal(pilotReleaseAllowed(null,'emp-13'),false);
});
