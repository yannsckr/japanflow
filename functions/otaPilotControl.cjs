'use strict';
function pilotAllowed(control, userId, nativeCode, appId) {
  return !!control && control.mode === 'beta' && Number.isSafeInteger(nativeCode) && nativeCode >= 19 &&
    typeof control.androidAppId === 'string' && /^1:1079648624157:android:[a-f0-9]+$/.test(control.androidAppId) &&
    appId === control.androidAppId &&
    Array.isArray(control.pilotUserIds) && control.pilotUserIds.length > 0 && control.pilotUserIds.length <= 5 &&
    control.pilotUserIds.every(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)) &&
    control.pilotUserIds.includes(userId);
}
function pilotReleaseAllowed(release, userId) {
  return release?.manifest?.channel === 'beta' && release.manifest.minNativeCode >= 19 &&
    Array.isArray(release.targetUserIds) && release.targetUserIds.length > 0 && release.targetUserIds.length <= 5 &&
    release.targetUserIds.includes(userId);
}
module.exports = { pilotAllowed, pilotReleaseAllowed };
