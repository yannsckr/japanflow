'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, deleteDoc, getDoc } = require('firebase/firestore');

(async () => {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-japanflow-releases';
  const testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync(path.resolve('firestore.rules'), 'utf8') },
  });
  const seeded = {
    version: '1.0.3',
    title: 'JapanFlow — versão de teste',
    notes: 'Testes de permissões',
    channel: 'beta',
    downloadUrl: 'https://firebasestorage.googleapis.com/test.apk',
    mandatory: false,
    status: 'published',
    createdBy: 'ti-user',
    createdAt: new Date('2026-11-10T12:00:00Z'),
    publishedAt: new Date('2026-11-10T12:00:00Z'),
  };
  try {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'auth_links', 'uid-ti'), {
        user_id: 'ti-user',
        role: 'employee',
        active: true,
      });
      await setDoc(doc(db, 'auth_links', 'uid-employee'), {
        user_id: 'employee-user',
        role: 'employee',
        active: true,
      });
      await setDoc(doc(db, 'users', 'ti-user'), {
        username: 'japan-ti',
        active: true,
        sectors: ['ti'],
      });
      await setDoc(doc(db, 'users', 'employee-user'), {
        username: 'normal',
        active: true,
        sectors: ['vendas'],
      });
      await setDoc(doc(db, 'cosmos_releases', 'release-test'), seeded);
    });
    const ti = testEnv.authenticatedContext('uid-ti').firestore();
    const employee = testEnv.authenticatedContext('uid-employee').firestore();
    const anonymous = testEnv.unauthenticatedContext().firestore();
    const release = (db) => doc(db, 'cosmos_releases', 'release-test');

    await assertSucceeds(getDoc(release(employee)));
    await assertFails(getDoc(release(anonymous)));
    await assertFails(updateDoc(release(employee), { title: 'Tentativa inválida' }));
    await assertFails(deleteDoc(release(employee)));
    await assertFails(updateDoc(release(ti), { version: '9.9.9' }));
    await assertFails(updateDoc(release(ti), { downloadUrl: 'https://bad.example/apk' }));
    await assertSucceeds(
      updateDoc(release(ti), {
        title: 'Atualização de título',
        notes: 'Novo changelog',
        channel: 'stable',
      })
    );
    await assertSucceeds(updateDoc(release(ti), { mandatory: true }));
    await assertSucceeds(deleteDoc(release(ti)));
    console.log(
      'PASSOU: leitura autenticada; edição e exclusão restritas à TI; versão e URL imutáveis.'
    );
  } finally {
    await testEnv.cleanup();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
