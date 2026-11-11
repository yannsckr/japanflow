'use strict';
// Testes de regras locais: nao realiza chamadas para producao.
const fs = require('node:fs');
const path = require('node:path');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const { setDoc, doc } = require('firebase/firestore');
const { ref, uploadBytes, getMetadata, deleteObject } = require('firebase/storage');

const root = path.resolve(__dirname, '..');
const storageRules = fs.readFileSync(path.join(root, 'storage.rules'), 'utf8');
const firestoreRules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const matchPaths = [
  ...storageRules.matchAll(/match\s+\/(cosmos|japanflow)\/releases\/\{userId\}\/\{fileName\}/g),
].map((m) => m[1]);
if (!matchPaths.length) throw Error('Nenhuma regra de upload APK encontrada em storage.rules.');
const bucket = 'demo-japanflow-storage.firebasestorage.app';
let env;
const filename = '123e4567-e89b-12d3-a456-426614174000.apk';
const apkBytes = Buffer.from('not-a-real-apk-for-rule-testing');
const metadata = { contentType: 'application/vnd.android.package-archive' };
async function main() {
  env = await initializeTestEnvironment({
    projectId: 'demo-japanflow-storage',
    firestore: { rules: firestoreRules, host: '127.0.0.1', port: 8085 },
    storage: { rules: storageRules, host: '127.0.0.1', port: 9199 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'auth_links', 'uid-ti'), {
      user_id: 'ti-user',
      active: true,
      role: 'staff',
    });
    await setDoc(doc(db, 'auth_links', 'uid-employee'), {
      user_id: 'normal-user',
      active: true,
      role: 'staff',
    });
    await setDoc(doc(db, 'users', 'ti-user'), { username: 'ryan', active: true, sectors: ['ti'] });
    await setDoc(doc(db, 'users', 'normal-user'), {
      username: 'funcionario',
      active: true,
      sectors: ['vendas'],
    });
  });
  const ti = env.authenticatedContext('uid-ti');
  const employee = env.authenticatedContext('uid-employee');
  const anonymous = env.unauthenticatedContext();
  for (const prefix of [...new Set(matchPaths)]) {
    const objectPath = `${prefix}/releases/ti-user/${filename}`;
    const employeePath = `${prefix}/releases/normal-user/123e4567-e89b-12d3-a456-426614174001.apk`;
    const tiRef = ref(ti.storage(bucket), objectPath);
    const employeeRef = ref(employee.storage(bucket), employeePath);
    const anonymousRef = ref(anonymous.storage(bucket), objectPath);
    console.log('Testando regras para', objectPath);
    await assertFails(uploadBytes(employeeRef, apkBytes, metadata));
    await assertFails(uploadBytes(ref(anonymous.storage(bucket), objectPath), apkBytes, metadata));
    await assertFails(
      uploadBytes(
        ref(
          ti.storage(bucket),
          `${prefix}/releases/normal-user/123e4567-e89b-12d3-a456-426614174002.apk`
        ),
        apkBytes,
        metadata
      )
    );
    await assertFails(
      uploadBytes(
        ref(
          ti.storage(bucket),
          `${prefix}/releases/ti-user/123e4567-e89b-12d3-a456-426614174003.apk`
        ),
        apkBytes,
        { contentType: 'text/plain' }
      )
    );
    await assertSucceeds(uploadBytes(tiRef, apkBytes, metadata));
    await assertSucceeds(getMetadata(tiRef));
    await assertSucceeds(getMetadata(ref(employee.storage(bucket), objectPath)));
    await assertFails(getMetadata(anonymousRef));
    await assertFails(uploadBytes(tiRef, apkBytes, metadata));
    await assertFails(deleteObject(tiRef));
    console.log(
      'PASSOU:',
      prefix,
      'TI publica, funcionario/anonimo bloqueados, MIME e pasta validos, sobrescrita/exclusao bloqueadas.'
    );
  }
  console.log('TODOS OS TESTES DE STORAGE PASSARAM');
}
main()
  .catch((err) => {
    console.error('FALHOU:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (env) await env.cleanup();
  });
