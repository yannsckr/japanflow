'use strict';
// Copie para tests/TESTAR-V45.5-EMULADOR.cjs dentro do repositorio.
const path = require('path');
const fs = require('fs');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const { doc, collection, setDoc, writeBatch, Timestamp, getDoc } = require('firebase/firestore');

const projectId = 'demo-japanflow-qa';
const repo = process.cwd();
const rules = fs.readFileSync(path.join(repo, 'firestore.rules'), 'utf8');

(async () => {
  let env;
  let passed = 0;
  async function check(label, fn) {
    await fn();
    passed++;
    console.log('OK', label);
  }
  try {
    env = await initializeTestEnvironment({ projectId, firestore: { rules } });
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (const [uid, userId, sectors, username] of [
        ['sales-auth', 'emp-sales', ['vendas'], 'paloma'],
        ['shipping-auth', 'emp-shipping', ['expedicao'], 'julio'],
        ['other-auth', 'emp-other', ['compras'], 'other'],
      ]) {
        await setDoc(doc(db, 'auth_links', uid), {
          user_id: userId,
          active: true,
          role: 'employee',
        });
        await setDoc(doc(db, 'users', userId), { sectors, active: true, username });
      }
    });
    const seller = env.authenticatedContext('sales-auth').firestore();
    const shipping = env.authenticatedContext('shipping-auth').firestore();
    const other = env.authenticatedContext('other-auth').firestore();
    function taskData(userId) {
      return {
        board_visible: true,
        title: 'Separacao de Pedido - Teste',
        description: 'Teste',
        client_id: 'client-test',
        client_name: 'Cliente Teste',
        client_address: 'Endereco Teste',
        delivery_address: 'Rua Teste, 123',
        delivery_place_id: null,
        delivery_method: 'motoboy',
        priority: 'medium',
        assignee_id: '',
        deadline: '',
        status: 'todo',
        created_by: userId,
        sector: 'expedicao',
        image_url: null,
        image_urls: [],
        status_history: [{ status: 'todo', enteredAt: new Date().toISOString() }],
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      };
    }
    function rideData(taskId, userId) {
      return {
        description: 'Entrega: Separacao de Pedido - Teste',
        assigned_to: null,
        assigned_by: userId,
        ride_value: 15,
        client_name: 'Cliente Teste',
        location: 'Rua Teste, 123',
        notes: '',
        status: 'pending',
        task_id: null,
        source_order_task_id: taskId,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      };
    }
    let rideId;
    await check('Vendas cria pedido e corrida no mesmo batch', async () => {
      const task = doc(collection(seller, 'tasks'));
      const ride = doc(seller, 'motoboy_assignments', `order_${task.id}`);
      rideId = ride.id;
      const batch = writeBatch(seller);
      batch.set(task, taskData('emp-sales'));
      batch.set(ride, rideData(task.id, 'emp-sales'));
      await assertSucceeds(batch.commit());
      const snapshot = await getDoc(ride);
      if (!snapshot.exists()) throw new Error('Corrida nao encontrada apos batch');
    });
    await check('Vendas nao pode designar motoboy', async () => {
      const batch = writeBatch(seller);
      batch.update(doc(seller, 'motoboy_assignments', rideId), { assigned_to: 'emp-rider' });
      await assertFails(batch.commit());
    });
    await check('Usuario sem setor Vendas nao cria corrida por pedido', async () => {
      const task = doc(collection(other, 'tasks'));
      const ride = doc(other, 'motoboy_assignments', `order_${task.id}`);
      const batch = writeBatch(other);
      batch.set(task, taskData('emp-other'));
      batch.set(ride, rideData(task.id, 'emp-other'));
      await assertFails(batch.commit());
    });
    await check('Expedicao pode designar corrida existente', async () => {
      await assertSucceeds(
        setDoc(
          doc(shipping, 'motoboy_assignments', rideId),
          {
            assigned_to: 'emp-rider',
            updated_at: Timestamp.now(),
          },
          { merge: true }
        )
      );
    });
    console.log(`V45.5: ${passed} passaram; 0 falharam.`);
  } catch (error) {
    console.error(`V45.5: ${passed} passaram; falhou:`, error);
    process.exitCode = 1;
  } finally {
    if (env) await env.cleanup();
  }
})();
