import fs from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
} from 'firebase/firestore';

const projectId = 'demo-japanflow-monthly';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run only inside Firestore emulator');
const env = await initializeTestEnvironment({
  projectId,
  firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
});
try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [uid, id, role, sector] of [
      ['dispatch', 'patricia', 'employee', 'expedicao'],
      ['admin', 'admin-id', 'admin', 'ti'],
      ['rider', 'luciano', 'employee', 'motoboys'],
      ['sales', 'sales-id', 'employee', 'vendas'],
      ['granted', 'granted-id', 'employee', 'vendas'],
    ]) {
      await setDoc(doc(db, 'auth_links', uid), { user_id: id, role, active: true });
      await setDoc(doc(db, 'users', id), { name: id, role, sectors: [sector], active: true });
    }
    await setDoc(doc(db, 'user_feature_permissions', 'motoboy_management__granted-id'), {
      enabled: true,
      user_id: 'granted-id',
      feature_key: 'motoboy_management',
    });
    await setDoc(doc(db, 'motoboy_journeys', 'luciano_2026-11-26'), {
      user_id: 'luciano',
      day: '2026-11-26',
      start_odometer: 1,
      end_odometer: 11,
    });
    await setDoc(doc(db, 'motoboy_ride_report_events', 'test'), {
      ride_id: 'ride',
      event_at: new Date(),
      before: null,
      after: { assigned_to: 'luciano' },
    });
    await setDoc(doc(db, 'motoboy_assignments', 'ride'), {
      assigned_to: null,
      status: 'pending',
      client_name: 'A',
      location: 'B',
    });
  });
  const db = (uid) => env.authenticatedContext(uid).firestore();
  const events = (database) => collection(database, 'motoboy_ride_report_events');
  const journeys = (database) => collection(database, 'motoboy_journeys');
  for (const uid of ['dispatch', 'admin', 'granted']) {
    await assertSucceeds(getDocs(events(db(uid))));
    await assertSucceeds(
      getDocs(
        query(journeys(db(uid)), where('day', '>=', '2026-11-01'), where('day', '<', '2026-12-01'))
      )
    );
    await assertFails(setDoc(doc(events(db(uid)), 'forged'), { ride_id: 'fake' }));
    await assertFails(updateDoc(doc(events(db(uid)), 'test'), { ride_id: 'fake' }));
    await assertFails(deleteDoc(doc(events(db(uid)), 'test')));
  }
  await assertFails(getDocs(events(db('sales'))));
  await assertFails(getDocs(events(db('rider'))));
  await assertFails(getDocs(events(env.unauthenticatedContext().firestore())));
  await assertFails(getDocs(journeys(db('sales'))));
  await assertFails(getDocs(journeys(db('rider'))));
  await assertSucceeds(getDocs(query(journeys(db('rider')), where('user_id', '==', 'luciano'))));
  await assertSucceeds(getDoc(doc(journeys(db('rider')), 'luciano_2026-11-26')));
  await assertFails(
    updateDoc(doc(journeys(db('dispatch')), 'luciano_2026-11-26'), { end_odometer: 999 })
  );
  await assertSucceeds(
    updateDoc(doc(db('dispatch'), 'motoboy_assignments', 'ride'), {
      client_name: 'Corrigido',
      location: 'Novo',
    })
  );
  await assertFails(
    updateDoc(doc(db('sales'), 'motoboy_assignments', 'ride'), { location: 'Nao autorizado' })
  );
  for (const uid of ['dispatch', 'admin', 'granted', 'sales', 'rider']) {
    await assertFails(setDoc(doc(db(uid), 'motoboy_admin_audit', 'forged'), { actor: uid }));
    await assertFails(getDocs(collection(db(uid), 'motoboy_admin_audit')));
  }
  console.log('V48.3 MONTHLY REPORT RULES: ALL ASSERTIONS PASSED');
} finally {
  await env.cleanup();
}
