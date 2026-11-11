import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { assertLocal } = require('./isolation.cjs');
// Fail before Firebase imports or creation of any client outside the demo.
const isolation = assertLocal(process.env);
const { initializeTestEnvironment, assertSucceeds, assertFails } =
  await import('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc } = await import('firebase/firestore');
const { ref, uploadBytes, getBytes } = await import('firebase/storage');
const { initializeApp, deleteApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, '../..');
const candidate = path.join(repo, 'functions');
const bucketUrl = 'gs://japanflow-erp.firebasestorage.app';
const mediaPath =
  'attachments/warranties/site/00000000-0000-4000-8000-000000000029/' + 'a'.repeat(64) + '/0';
const image = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
let env, admin, receive;
const fields = (id) => ({
  requestId: id,
  name: 'Cliente Fictício Emulador',
  order: '#0029',
  channel: 'E-mail',
  contact: 'teste@example.com',
  product: 'Peça fictícia de teste',
  received: '2020-01-02',
  installed: 'Não',
  vehicle: '',
  problem: 'Solicitação fictícia criada apenas no emulador local.',
  notes: '',
  files: [],
});
before(async () => {
  env = await initializeTestEnvironment({
    projectId: isolation.projectId,
    firestore: {
      ...isolation.firestore,
      rules: readFileSync(path.join(repo, 'firestore.rules'), 'utf8'),
    },
    storage: {
      ...isolation.storage,
      rules: readFileSync(path.join(repo, 'storage.rules'), 'utf8'),
    },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'auth_links/test-active'), {
      user_id: 'test-employee',
      active: true,
      role: 'employee',
    });
    await setDoc(doc(ctx.firestore(), 'auth_links/test-inactive'), {
      user_id: 'test-inactive',
      active: false,
      role: 'employee',
    });
    await setDoc(doc(ctx.firestore(), 'auth_links/test-admin'), {
      user_id: 'test-admin',
      active: true,
      role: 'admin',
    });
    await setDoc(doc(ctx.firestore(), 'warranty_claims/test-site'), {
      client_name: 'Cliente Fictício',
      origin: 'site',
      requested_by: 'site',
      status: 'pendente',
    });
    await setDoc(doc(ctx.firestore(), 'site_warranty_receipts/test-receipt'), {
      state: 'complete',
    });
    await uploadBytes(ref(ctx.storage(bucketUrl), mediaPath), image, { contentType: 'image/png' });
  });
  admin = initializeApp({
    projectId: isolation.projectId,
    storageBucket: isolation.projectId + '.appspot.com',
  });
  // Real Admin SDK connects to the emulators. Callable wrapper, App Check
  // context and configuration are mocked: this does NOT test App Check.
  const exports = {};
  class HttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }
  const imports = {
    'firebase-admin/firestore': {
      ...require('firebase-admin/firestore'),
      getFirestore: () => {
        const db = getFirestore();
        return {
          doc: (p) => db.doc(p),
          runTransaction: async (...args) => {
            try {
              return await db.runTransaction(...args);
            } catch (error) {
              console.error('LOCAL_EMULATOR_DIAGNOSTIC:', error.code || '', error.message);
              throw error;
            }
          },
        };
      },
    },
    'firebase-functions/v2/https': { onCall: (_options, handler) => handler, HttpsError },
    'firebase-functions/params': {
      defineBoolean: () => ({ value: () => true }),
      defineInt: () => ({ value: () => 50 }),
      defineString: () => ({ value: () => 'test-public-app' }),
    },
    './siteWarranty.cjs': require(path.join(candidate, 'siteWarranty.cjs')),
  };
  // The real Firestore SDK checks Promise identity. Run in the Node realm,
  // while keeping imports explicitly injected and the demo guard above.
  const execute = vm.runInThisContext(
    '(function(exports,require){\n' +
      readFileSync(path.join(candidate, 'siteWarrantyFirebase.cjs'), 'utf8') +
      '\n})'
  );
  execute(exports, (id) => (Object.hasOwn(imports, id) ? imports[id] : require(id)));
  receive = (data) => exports.receiveSiteWarranty({ data, app: { appId: 'test-public-app' } });
});
after(async () => {
  if (env) await env.cleanup();
  if (admin) await deleteApp(admin);
});

test('Firestore: visitante não lê garantias', async () =>
  assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'warranty_claims/test-site'))));
test('Firestore: visitante não cria garantia diretamente', async () =>
  assertFails(
    setDoc(doc(env.unauthenticatedContext().firestore(), 'warranty_claims/forged'), {
      requested_by: 'site',
    })
  ));
test('Firestore: funcionário ativo lê garantia Site', async () =>
  assertSucceeds(
    getDoc(doc(env.authenticatedContext('test-active').firestore(), 'warranty_claims/test-site'))
  ));
test('Firestore: usuário sem vínculo não lê garantia', async () =>
  assertFails(
    getDoc(doc(env.authenticatedContext('test-unlinked').firestore(), 'warranty_claims/test-site'))
  ));
test('Firestore: usuário inativo não lê garantia', async () =>
  assertFails(
    getDoc(doc(env.authenticatedContext('test-inactive').firestore(), 'warranty_claims/test-site'))
  ));
test('Firestore: funcionário não altera recibo', async () =>
  assertFails(
    setDoc(
      doc(
        env.authenticatedContext('test-active').firestore(),
        'site_warranty_receipts/test-receipt'
      ),
      { state: 'complete' }
    )
  ));
test('Firestore: administrador no navegador não lê recibo', async () =>
  assertFails(
    getDoc(
      doc(env.authenticatedContext('test-admin').firestore(), 'site_warranty_receipts/test-receipt')
    )
  ));
test('Storage: visitante não lê anexo', async () =>
  assertFails(getBytes(ref(env.unauthenticatedContext().storage(bucketUrl), mediaPath))));
test('Storage: usuário inativo não lê anexo', async () =>
  assertFails(
    getBytes(ref(env.authenticatedContext('test-inactive').storage(bucketUrl), mediaPath))
  ));
test('Storage: funcionário ativo recebe os mesmos bytes', async () => {
  const bytes = await assertSucceeds(
    getBytes(ref(env.authenticatedContext('test-active').storage(bucketUrl), mediaPath))
  );
  assert.deepEqual(new Uint8Array(bytes), image);
});
test('Storage: visitante não envia diretamente à pasta de garantia', async () =>
  assertFails(
    uploadBytes(ref(env.unauthenticatedContext().storage(bucketUrl), mediaPath + 'x'), image, {
      contentType: 'image/png',
    })
  ));

test('adapter: transação no emulador cria garantia e tarefa uma vez', async () => {
  const id = '00000000-0000-4000-8000-000000000041',
    input = fields(id);
  const a = await receive(input),
    b = await receive(input);
  assert.equal(a.protocol, b.protocol);
  const db = getFirestore();
  const claim = await db.doc('warranty_claims/site_' + id).get();
  const task = await db.doc('tasks/warranty_site_' + id).get();
  assert.equal(claim.exists, true);
  assert.equal(claim.data().requested_by, 'site');
  assert.equal(task.exists, true);
  assert.equal(claim.data().site_order, '#0029');
  assert.equal(claim.data().invoice_number, '');
});
test('adapter: requisições concorrentes não duplicam documentos', async () => {
  const id = '00000000-0000-4000-8000-000000000042',
    input = fields(id);
  const results = await Promise.allSettled([receive(input), receive(input)]);
  assert.ok(results.some((r) => r.status === 'fulfilled'));
  const db = getFirestore();
  assert.equal((await db.doc('warranty_claims/site_' + id).get()).exists, true);
  assert.equal((await db.doc('tasks/warranty_site_' + id).get()).exists, true);
});

test('adapter: anexo privado percorre Storage e volta com bytes idênticos', async () => {
  const id = '00000000-0000-4000-8000-000000000043';
  const original = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jUTkAAAAASUVORK5CYII=',
    'base64'
  );
  const input = {
    ...fields(id),
    files: [{ name: 'teste-local.png', type: 'image/png', base64: original.toString('base64') }],
  };
  await receive(input);
  const claim = (
    await getFirestore()
      .doc('warranty_claims/site_' + id)
      .get()
  ).data();
  const file = claim.site_attachments[0];
  const downloaded = await getBytes(
    ref(env.authenticatedContext('test-active').storage(bucketUrl), file.path)
  );
  assert.ok(Buffer.from(downloaded).equals(original));
  const { createHash } = await import('node:crypto');
  assert.equal(createHash('sha256').update(Buffer.from(downloaded)).digest('hex'), file.sha256);
  await assertFails(getBytes(ref(env.unauthenticatedContext().storage(bucketUrl), file.path)));
});
