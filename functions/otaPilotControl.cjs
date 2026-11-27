'use strict';
function pilotAllowed(control, userId, nativeCode, appId) {
  return !!control && control.mode === 'stable' && Number.isSafeInteger(nativeCode) && nativeCode >= 20 &&
    typeof userId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(userId) &&
    typeof control.androidAppId === 'string' && /^1:1079648624157:android:[a-f0-9]+$/.test(control.androidAppId) &&
    appId === control.androidAppId;
}
function pilotReleaseAllowed(release, userId) {
  return typeof userId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(userId) &&
    release?.manifest?.channel === 'stable' && release.manifest.minNativeCode >= 20 &&
    Array.isArray(release.targetUserIds) && release.targetUserIds.length === 0;
}
module.exports = { pilotAllowed, pilotReleaseAllowed };
