'use strict';

const fs = require('node:fs');

const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');

const {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
} = require('firebase/firestore');

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Firestore emulator required');
  }

  const env = await initializeTestEnvironment({
    projectId: 'demo-japanflow-ota-distribution',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });

  try {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      for (const [uid, username, role] of [
        ['ti', 'japan-ti', 'employee'],
        ['admin', 'admin-test', 'admin'],
        ['employee', 'employee-test', 'employee'],
      ]) {
        await setDoc(doc(db, 'auth_links', uid), {
          user_id: uid,
          active: true,
          role,
        });

        await setDoc(doc(db, 'users', uid), {
          active: true,
          username,
          sectors: uid === 'ti' ? ['ti'] : ['vendas'],
        });
      }

      await setDoc(doc(db, 'japanflow_ota_distribution', 'test-release'), {
        sequence: 1,
        signature: 'test',
      });

      await assertSucceeds(getDoc(doc(db, 'japanflow_ota_distribution', 'test-release')));
    });

    const contexts = [
      env.authenticatedContext('ti'),
      env.authenticatedContext('admin'),
      env.authenticatedContext('employee'),
      env.unauthenticatedContext(),
    ];

    let passed = 0;

    for (const context of contexts) {
      const db = context.firestore();
      const name = 'japanflow_ota_distribution';

      const existing = doc(db, name, 'test-release');

      await assertFails(getDoc(existing));
      await assertFails(getDocs(collection(db, name)));
      await assertFails(setDoc(doc(db, name, 'new'), {}));
      await assertFails(updateDoc(existing, { sequence: 2 }));
      await assertFails(deleteDoc(existing));

      await assertFails(
        setDoc(doc(db, name, 'test-release', 'nested', 'test'), { unauthorized: true })
      );

      passed += 6;
    }

    console.log(`OTA DISTRIBUTION SECURITY: ${passed}/24 PASSED`);
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
