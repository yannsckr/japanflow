import fs from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
const projectId = 'demo-japanflow-v483';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST)
  throw new Error('Run only with emulators');
const env = await initializeTestEnvironment({
  projectId,
  firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  storage: { rules: fs.readFileSync('storage.rules', 'utf8') },
});
try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, role] of [
      ['rider', 'employee'],
      ['manager', 'employee'],
      ['outsider', 'employee'],
      ['admin', 'admin'],
    ]) {
      await db.doc(`auth_links/${uid}`).set({ user_id: uid, role, active: true });
    }
    await db
      .doc('user_feature_permissions/motoboy_management__manager')
      .set({ user_id: 'manager', feature_key: 'motoboy_management', enabled: true });
  });
  const path = 'odometer-proof/rider/valid-proof-123.jpg';
  const file = (uid) => env.authenticatedContext(uid).storage().ref(path);
  await assertSucceeds(file('rider').putString('evidence', 'raw', { contentType: 'image/jpeg' }));
  await assertSucceeds(file('manager').getMetadata());
  await assertSucceeds(file('admin').getMetadata());
  await assertFails(file('outsider').getMetadata());
  await assertFails(file('manager').putString('fake', 'raw', { contentType: 'image/jpeg' }));
  await assertFails(file('manager').delete());
  await assertFails(file('admin').delete());
  console.log('V48.3 ODOMETER RULES PASSED');
} finally {
  await env.cleanup();
}
