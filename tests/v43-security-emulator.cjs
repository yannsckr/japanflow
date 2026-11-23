'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, arrayUnion } = require('firebase/firestore');
(async () => {
  const env = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT || 'demo-japanflow-qa',
    firestore: { rules: fs.readFileSync(path.resolve('firestore.rules'), 'utf8') },
  });
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (const [uid, userId, username, sectors] of [
        ['uid-julio', 'julio-id', 'julio', ['expedicao']],
        ['uid-joe', 'joe-id', 'joe_', ['expedicao']],
        ['uid-ryan', 'ryan-id', 'ryan', ['ti']],
      ]) {
        await setDoc(doc(db, 'auth_links', uid), {
          user_id: userId,
          role: 'employee',
          active: true,
        });
        await setDoc(doc(db, 'users', userId), { username, active: true, sectors });
      }
      await setDoc(doc(db, 'tasks', 'exp-unassigned'), {
        title: 'Separar',
        sector: 'expedicao',
        assignee_id: '',
        assignee_ids: [],
        status: 'todo',
      });
      await setDoc(doc(db, 'tasks', 'jean-to-ryan'), {
        title: 'Somente Ryan',
        sector: 'expedicao',
        assignee_id: 'ryan-id',
        status: 'todo',
      });
      await setDoc(doc(db, 'cosmos_releases', 'old'), {
        version: '1.0.0',
        title: 'Antiga',
        notes: 'A',
        channel: 'stable',
        status: 'published',
        mandatory: false,
        downloadUrl: 'https://example.org/old.apk',
        createdBy: 'ryan-id',
        createdAt: new Date(),
        publishedAt: new Date(),
      });
    });
    const julio = env.authenticatedContext('uid-julio').firestore();
    const joe = env.authenticatedContext('uid-joe').firestore();
    const ryan = env.authenticatedContext('uid-ryan').firestore();
    const exp = (db) => doc(db, 'tasks', 'exp-unassigned');
    await assertSucceeds(updateDoc(exp(julio), { claimed_by_ids: arrayUnion('julio-id') }));
    await assertFails(updateDoc(exp(joe), { claimed_by_ids: arrayUnion('joe-id') }));
    await assertFails(updateDoc(exp(julio), { claimed_by_ids: [] }));
    await assertFails(
      updateDoc(doc(julio, 'tasks', 'jean-to-ryan'), { claimed_by_ids: arrayUnion('julio-id') })
    );
    await assertSucceeds(
      updateDoc(doc(ryan, 'cosmos_releases', 'old'), {
        audience: 'selected',
        targetUserIds: ['julio-id'],
      })
    );
    await assertFails(
      updateDoc(doc(joe, 'cosmos_releases', 'old'), { audience: 'all', targetUserIds: [] })
    );
    console.log('V43: 6 verificacoes de autorizacao passaram');
  } finally {
    await env.cleanup();
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
