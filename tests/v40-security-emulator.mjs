import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
const env = await initializeTestEnvironment({
  projectId: process.env.FIREBASE_PROJECT_ID || 'demo-japanflow-qa',
  firestore: {
    host,
    port: Number(port),
    rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
  },
});
let failed = 0;
let passed = 0;
async function check(description, operation, shouldPass) {
  try {
    await (shouldPass ? assertSucceeds(operation()) : assertFails(operation()));
    passed++;
    console.log('OK  ', description);
  } catch (err) {
    failed++;
    console.error('FAIL', description, err?.message || err);
  }
}
const ids = {
  admin: ['v402-admin', 'v402-administrator', 'admin', []],
  expedition: ['v402-expedition', 'v402-dispatcher', 'employee', ['expedicao']],
  sales: ['v402-sales', 'v402-salesperson', 'employee', ['vendas']],
  rider: ['v402-rider', 'v402-rider-person', 'employee', ['motoboys']],
  other: ['v402-other', 'v402-other-person', 'employee', []],
  inactive: ['v402-inactive', 'v402-inactive-person', 'employee', []],
};
const db = (key) => env.authenticatedContext(ids[key][0]).firestore();
const ref = (key, collection, id) => doc(db(key), collection, id);
try {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore();
    for (const [key, [uid, id, role, sectors]] of Object.entries(ids)) {
      const active = key !== 'inactive';
      await setDoc(doc(admin, 'auth_links', uid), { user_id: id, role, active });
      await setDoc(doc(admin, 'users', id), { username: `v402_${key}`, role, sectors, active });
    }
    await setDoc(doc(admin, 'motoboy_assignments', 'v402-existing'), {
      assigned_to: ids.rider[1],
      status: 'pending',
      created_at: new Date(),
    });
    await setDoc(doc(admin, 'departmental_clients', 'v402-client'), {
      name: 'Cliente QA',
      address: 'QA',
    });
    await setDoc(doc(admin, 'motoboy_occurrences', 'v402-occurrence'), {
      user_id: ids.rider[1],
      ride_id: 'v402-existing',
      details: 'QA',
    });
    await setDoc(doc(admin, 'motoboy_device_tokens', ids.rider[1]), {
      user_id: ids.rider[1],
      token: 't'.repeat(36),
      platform: 'android',
      updated_at: new Date(),
    });
  });

  // Quem gerencia corridas no ERP, quem só acompanha e quem não deve escrever.
  await check(
    'Admin cria corrida',
    () => setDoc(ref('admin', 'motoboy_assignments', 'v402-admin-ride'), { status: 'pending' }),
    true
  );
  await check(
    'Expedição cria corrida',
    () => setDoc(ref('expedition', 'motoboy_assignments', 'v402-exp-ride'), { status: 'pending' }),
    true
  );
  await check(
    'Vendas sem permissão de gestor não cria corrida',
    () => setDoc(ref('sales', 'motoboy_assignments', 'v402-sales-ride'), { status: 'pending' }),
    false
  );
  await check(
    'Motoboy não cria corrida diretamente',
    () => setDoc(ref('rider', 'motoboy_assignments', 'v402-rider-ride'), { status: 'pending' }),
    false
  );
  await check(
    'Motoboy não inicia corrida diretamente',
    () => updateDoc(ref('rider', 'motoboy_assignments', 'v402-existing'), { status: 'accepted' }),
    false
  );
  await check(
    'Expedição edita corrida',
    () =>
      updateDoc(ref('expedition', 'motoboy_assignments', 'v402-existing'), { notes: 'Atribuída' }),
    true
  );
  await check(
    'Usuário comum não exclui corrida',
    () => deleteDoc(ref('other', 'motoboy_assignments', 'v402-existing')),
    false
  );

  // Clientes são modificados via Admin SDK / callable, não pelo navegador.
  await check(
    'ERP de Vendas lê cliente',
    () => getDoc(ref('sales', 'departmental_clients', 'v402-client')),
    true
  );
  await check(
    'Usuário comum lê cliente',
    () => getDoc(ref('other', 'departmental_clients', 'v402-client')),
    true
  );
  await check(
    'Nem Admin cria cliente diretamente',
    () =>
      setDoc(ref('admin', 'departmental_clients', 'v402-client-direct'), { name: 'Sem Function' }),
    false
  );
  await check(
    'Nem Vendas edita cliente diretamente',
    () => updateDoc(ref('sales', 'departmental_clients', 'v402-client'), { name: 'Bypass' }),
    false
  );
  await check(
    'Admin exclui cliente',
    () => deleteDoc(ref('admin', 'departmental_clients', 'v402-client')),
    true
  );

  // Token só pode ser escrito pelo dono autenticado e com campos rígidos.
  await check(
    'Motoboy lê próprio token',
    () => getDoc(ref('rider', 'motoboy_device_tokens', ids.rider[1])),
    true
  );
  await check(
    'Outro usuário não lê token',
    () => getDoc(ref('other', 'motoboy_device_tokens', ids.rider[1])),
    false
  );
  await check(
    'Motoboy atualiza próprio token válido',
    () =>
      updateDoc(ref('rider', 'motoboy_device_tokens', ids.rider[1]), {
        token: 'x'.repeat(40),
        updated_at: serverTimestamp(),
      }),
    true
  );
  await check(
    'Outro usuário não sobrescreve token',
    () =>
      updateDoc(ref('other', 'motoboy_device_tokens', ids.rider[1]), {
        token: 'x'.repeat(40),
        updated_at: serverTimestamp(),
      }),
    false
  );
  await check(
    'Motoboy não grava campos extras em token',
    () => updateDoc(ref('rider', 'motoboy_device_tokens', ids.rider[1]), { admin: true }),
    false
  );

  // Ocorrência é criada pelo backend; só gestores/leitores autorizados consultam.
  await check(
    'Expedição lê ocorrência',
    () => getDoc(ref('expedition', 'motoboy_occurrences', 'v402-occurrence')),
    true
  );
  await check(
    'Admin lê ocorrência',
    () => getDoc(ref('admin', 'motoboy_occurrences', 'v402-occurrence')),
    true
  );
  await check(
    'Motoboy não lê coleção administrativa de ocorrências',
    () => getDoc(ref('rider', 'motoboy_occurrences', 'v402-occurrence')),
    false
  );
  await check(
    'Usuário comum não cria ocorrência diretamente',
    () => setDoc(ref('other', 'motoboy_occurrences', 'v402-forged'), { text: 'forjado' }),
    false
  );
  await check(
    'Nem Admin cria ocorrência diretamente',
    () => setDoc(ref('admin', 'motoboy_occurrences', 'v402-admin-forged'), { text: 'forjado' }),
    false
  );
  await check(
    'Usuário inativo não lê corrida',
    () => getDoc(ref('inactive', 'motoboy_assignments', 'v402-existing')),
    false
  );
} finally {
  await env.cleanup();
}
console.log(`\nV40.2: ${passed} passaram; ${failed} falharam`);
if (failed) process.exitCode = 1;
