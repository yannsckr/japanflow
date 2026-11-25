'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');

const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');

const {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} = require('firebase/firestore');

const projectId = 'demo-japanflow-ota';
const collectionName = 'japanflow_ota_releases';

const zipName = '00000000-0000-4000-8000-000000000001.zip';

const storagePath = `japanflow/ota/ti-user/${zipName}`;

const draft = {
  schemaVersion: 1,
  bundleVersion: '48.0.1',
  platform: 'android',
  title: 'JapanFlow OTA Test',
  notes: 'Permission validation',
  channel: 'beta',
  status: 'draft',
  minNativeCode: 18,
  maxNativeCode: 18,
  sha256: 'a'.repeat(64),
  sizeBytes: 1024,
  storagePath,
  createdBy: 'ti-user',
};

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    throw new Error('Run exclusively inside Firebase emulators');
  }

  const env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8085,
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: fs.readFileSync('storage.rules', 'utf8'),
    },
  });

  let passed = 0;
  let failed = 0;

  async function test(name, callback) {
    try {
      await callback();
      passed++;
      console.log(`PASS: ${name}`);
    } catch (error) {
      failed++;
      console.error(`FAIL: ${name}`, error.message);
    }
  }

  try {
    await env.clearFirestore();
    await env.clearStorage();

    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      const users = [
        {
          uid: 'uid-ti',
          id: 'ti-user',
          username: 'japan-ti',
          active: true,
          role: 'employee',
          sectors: ['ti'],
        },
        {
          uid: 'uid-employee',
          id: 'employee-user',
          username: 'employee',
          active: true,
          role: 'employee',
          sectors: ['vendas'],
        },
        {
          uid: 'uid-inactive',
          id: 'inactive-user',
          username: 'ryan',
          active: false,
          role: 'employee',
          sectors: ['ti'],
        },
        {
          uid: 'uid-admin',
          id: 'admin-user',
          username: 'ordinary-admin',
          active: true,
          role: 'admin',
          sectors: ['vendas'],
        },
      ];

      for (const user of users) {
        await setDoc(doc(db, 'auth_links', user.uid), {
          user_id: user.id,
          active: user.active,
          role: user.role,
        });

        await setDoc(doc(db, 'users', user.id), {
          username: user.username,
          active: user.active,
          sectors: user.sectors,
        });
      }

      await setDoc(doc(db, 'cosmos_releases', 'legacy-apk'), {
        version: '1.0.16',
        title: 'Legacy APK',
        notes: 'Compatibility test',
        channel: 'stable',
        status: 'published',
        mandatory: false,
        downloadUrl: 'https://example.com/test.apk',
        createdBy: 'ti-user',
        createdAt: new Date(),
        publishedAt: new Date(),
      });
    });

    const ti = env.authenticatedContext('uid-ti');
    const employee = env.authenticatedContext('uid-employee');
    const inactive = env.authenticatedContext('uid-inactive');
    const admin = env.authenticatedContext('uid-admin');
    const anonymous = env.unauthenticatedContext();

    const record = (context, id = 'valid-draft') => doc(context.firestore(), collectionName, id);

    const create = (context, id, overrides = {}) =>
      setDoc(record(context, id), {
        ...draft,
        ...overrides,
        createdAt: serverTimestamp(),
      });

    console.log('\n=== FIRESTORE OTA ===');

    await test('TI creates valid draft', () => assertSucceeds(create(ti, 'valid-draft')));

    await test('TI reads draft', () => assertSucceeds(getDoc(record(ti))));

    await test('TI lists drafts', () =>
      assertSucceeds(getDocs(collection(ti.firestore(), collectionName))));

    await test('Employee cannot read draft', () => assertFails(getDoc(record(employee))));

    await test('Employee cannot list drafts', () =>
      assertFails(getDocs(collection(employee.firestore(), collectionName))));

    await test('Employee cannot create draft', () =>
      assertFails(
        create(employee, 'employee-draft', {
          createdBy: 'employee-user',
          storagePath: `japanflow/ota/employee-user/${zipName}`,
        })
      ));

    await test('Inactive TI cannot read', () => assertFails(getDoc(record(inactive))));

    await test('Ordinary admin cannot read OTA drafts', () => assertFails(getDoc(record(admin))));

    await test('Anonymous cannot read draft', () => assertFails(getDoc(record(anonymous))));

    await test('Anonymous cannot create draft', () =>
      assertFails(create(anonymous, 'anonymous-draft')));

    await test('Direct publication is blocked', () =>
      assertFails(create(ti, 'published-draft', { status: 'published' })));

    await test('Draft publication by update is blocked', () =>
      assertFails(updateDoc(record(ti), { status: 'published' })));

    await test('Checksum modification is blocked', () =>
      assertFails(updateDoc(record(ti), { sha256: 'b'.repeat(64) })));

    await test('Draft deletion is blocked', () => assertFails(deleteDoc(record(ti))));

    await test('Invalid checksum is rejected', () =>
      assertFails(create(ti, 'bad-hash', { sha256: 'invalid' })));

    await test('Old native version is rejected', () =>
      assertFails(
        create(ti, 'old-native', {
          minNativeCode: 17,
          maxNativeCode: 18,
        })
      ));

    await test('Inverted compatibility range is rejected', () =>
      assertFails(
        create(ti, 'bad-range', {
          minNativeCode: 20,
          maxNativeCode: 18,
        })
      ));

    await test('Oversized package is rejected', () =>
      assertFails(
        create(ti, 'large-package', {
          sizeBytes: 104857601,
        })
      ));

    await test('Foreign storage owner is rejected', () =>
      assertFails(
        create(ti, 'foreign-owner', {
          storagePath: `japanflow/ota/employee-user/${zipName}`,
        })
      ));

    await test('Unknown fields are rejected', () =>
      assertFails(
        create(ti, 'unknown-field', {
          signatureVerified: true,
        })
      ));

    await test('APK release compatibility preserved', () =>
      assertSucceeds(getDoc(doc(employee.firestore(), 'cosmos_releases', 'legacy-apk'))));

    console.log('\n=== STORAGE OTA ===');

    const storageRef = (context, filename = storagePath) => context.storage().ref(filename);

    const upload = (context, filename = storagePath, mime = 'application/zip') =>
      storageRef(context, filename).putString('test-content', 'raw', {
        contentType: mime,
      });

    await test('TI uploads ZIP', () => assertSucceeds(upload(ti)));

    await test('TI reads ZIP metadata', () => assertSucceeds(storageRef(ti).getMetadata()));

    await test('Employee cannot read ZIP', () => assertFails(storageRef(employee).getMetadata()));

    await test('Anonymous cannot read ZIP', () => assertFails(storageRef(anonymous).getMetadata()));

    await test('Inactive TI cannot read ZIP', () =>
      assertFails(storageRef(inactive).getMetadata()));

    await test('Ordinary admin cannot read ZIP', () =>
      assertFails(storageRef(admin).getMetadata()));

    await test('Employee cannot upload ZIP', () =>
      assertFails(upload(employee, `japanflow/ota/employee-user/${zipName}`)));

    await test('TI cannot overwrite ZIP', () => assertFails(upload(ti)));

    await test('TI cannot delete ZIP', () => assertFails(storageRef(ti).delete()));

    await test('TI cannot upload to foreign directory', () =>
      assertFails(upload(ti, `japanflow/ota/employee-user/${zipName}`)));

    await test('Invalid MIME type is blocked', () =>
      assertFails(
        upload(
          ti,
          'japanflow/ota/ti-user/00000000-0000-4000-8000-000000000002.zip',
          'application/octet-stream'
        )
      ));

    await test('APK extension is blocked in OTA directory', () =>
      assertFails(upload(ti, 'japanflow/ota/ti-user/00000000-0000-4000-8000-000000000003.apk')));

    console.log('\n=== OTA SECURITY RESULT ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    assert.equal(failed, 0, 'OTA security checks failed');
    assert.equal(passed, 33, 'Unexpected test count');

    console.log('V47.3-C OTA SECURITY APPROVED');
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
