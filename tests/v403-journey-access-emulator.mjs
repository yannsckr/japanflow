import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
const env = await initializeTestEnvironment({
  projectId: process.env.FIREBASE_PROJECT_ID || 'demo-japanflow-qa',
  firestore: {
    host,
    port: Number(port),
    rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
  },
});
let passed = 0;
let failed = 0;
const user = (uid) => env.authenticatedContext(uid).firestore();
const check = async (name, promise, permitted) => {
  try {
    await (permitted ? assertSucceeds(promise) : assertFails(promise));
    console.log('OK  ' + name);
    passed++;
  } catch (error) {
    console.error('FAIL ' + name + ' :: ' + (error?.message || String(error)));
    failed++;
  }
};
try {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [authUid, userId, sectors] of [
      ['v403-rafael-auth', 'v403-rafael', ['motoboys']],
      ['v403-other-auth', 'v403-other', ['motoboys']],
    ]) {
      await setDoc(doc(db, 'auth_links', authUid), {
        user_id: userId,
        active: true,
        role: 'employee',
      });
      await setDoc(doc(db, 'users', userId), { active: true, sectors, username: userId });
    }
    await setDoc(doc(db, 'motoboy_journeys', 'v403-other_2026-11-19'), {
      user_id: 'v403-other',
      day: '2026-11-19',
      started_at: new Date(),
    });
    await setDoc(doc(db, 'motoboy_journeys', 'v403-rafael_2026-11-18'), {
      user_id: 'v403-rafael',
      day: '2026-11-18',
      started_at: new Date(),
    });
  });
  const r = user('v403-rafael-auth');
  await check(
    'Motoboy le a propria jornada AINDA INEXISTENTE',
    getDoc(doc(r, 'motoboy_journeys', 'v403-rafael_2026-11-19')),
    true
  );
  await check(
    'Motoboy le a propria jornada existente',
    getDoc(doc(r, 'motoboy_journeys', 'v403-rafael_2026-11-18')),
    true
  );
  await check(
    'Motoboy nao le a jornada existente de outro',
    getDoc(doc(r, 'motoboy_journeys', 'v403-other_2026-11-19')),
    false
  );
  await check(
    'Motoboy nao consulta id inexistente de outro',
    getDoc(doc(r, 'motoboy_journeys', 'v403-other_2026-11-20')),
    false
  );
  await check(
    'Motoboy nao pode criar registro de jornada diretamente',
    setDoc(doc(r, 'motoboy_journeys', 'v403-rafael_2026-11-19'), { user_id: 'v403-rafael' }),
    false
  );
  console.log(`V40.3: ${passed} passaram; ${failed} falharam`);
  if (failed) process.exitCode = 1;
} finally {
  await env.cleanup();
}
