'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, Timestamp } = require('firebase/firestore');

async function main() {
  const projectId = process.env.GCLOUD_PROJECT || 'demo-japanflow-qa';
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync(path.resolve('firestore.rules'), 'utf8') },
  });
  const ride = (id, sourceId) => ({
    description: 'Entrega: Separação de Pedido - Cliente Teste',
    assigned_to: null,
    assigned_by: id,
    ride_value: 15,
    client_name: 'Cliente Teste',
    location: 'Rua Teste 100',
    notes: '',
    status: 'pending',
    task_id: null,
    source_order_task_id: sourceId,
    created_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  });
  let passed = 0;
  async function scenario(name, action) {
    await action();
    passed++;
    console.log('OK:', name);
  }
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (const [uid, userId, sectors, role] of [
        ['uid-sales', 'emp-sales', ['vendas'], 'employee'],
        ['uid-motoboy', 'emp-mb', ['motoboys'], 'employee'],
        ['uid-expedicao', 'emp-exp', ['expedicao'], 'employee'],
      ]) {
        await setDoc(doc(db, 'auth_links', uid), { user_id: userId, role, active: true });
        await setDoc(doc(db, 'users', userId), { sectors, active: true });
      }
      await setDoc(doc(db, 'tasks', 'pedido1'), {
        created_by: 'emp-sales',
        sector: 'expedicao',
        delivery_method: 'motoboy',
        client_name: 'Cliente Teste',
        delivery_address: 'Rua Teste 100',
      });
      await setDoc(doc(db, 'tasks', 'pedido3'), {
        created_by: 'emp-sales',
        sector: 'expedicao',
        delivery_method: 'motoboy',
        client_name: 'Cliente Teste',
        delivery_address: 'Rua Teste 100',
      });
      await setDoc(doc(db, 'tasks', 'pedido2'), {
        created_by: 'emp-sales',
        sector: 'expedicao',
        delivery_method: 'correios',
        client_name: 'Cliente Teste',
        delivery_address: 'Rua Teste 100',
      });
    });
    const sales = env.authenticatedContext('uid-sales').firestore();
    const mb = env.authenticatedContext('uid-motoboy').firestore();
    const exp = env.authenticatedContext('uid-expedicao').firestore();
    await scenario('Vendas cria corrida pendente vinculada ao próprio pedido Motoboy', () =>
      assertSucceeds(
        setDoc(doc(sales, 'motoboy_assignments', 'order_pedido1'), ride('emp-sales', 'pedido1'))
      )
    );
    await scenario('Vendas não pode modificar uma corrida criada', () =>
      assertFails(
        updateDoc(doc(sales, 'motoboy_assignments', 'order_pedido1'), { assigned_to: 'emp-mb' })
      )
    );
    await scenario('Vendas não pode criar corrida de pedido Correios', () =>
      assertFails(
        setDoc(doc(sales, 'motoboy_assignments', 'order_pedido2'), ride('emp-sales', 'pedido2'))
      )
    );
    await scenario('Vendas não pode criar corrida já designada', () =>
      assertFails(
        setDoc(doc(sales, 'motoboy_assignments', 'order_pedido3'), {
          ...ride('emp-sales', 'pedido3'),
          assigned_to: 'emp-mb',
        })
      )
    );
    await scenario('Motoboy não pode criar corrida', () =>
      assertFails(
        setDoc(doc(mb, 'motoboy_assignments', 'order_pedido3'), ride('emp-mb', 'pedido3'))
      )
    );
    await scenario('Expedição pode designar a corrida', () =>
      assertSucceeds(
        updateDoc(doc(exp, 'motoboy_assignments', 'order_pedido1'), { assigned_to: 'emp-mb' })
      )
    );
    console.log(`V45.3: ${passed} testes passaram; 0 falharam.`);
  } finally {
    await env.cleanup();
  }
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
