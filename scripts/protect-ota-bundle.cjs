'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { inspectOtaZip } = require('../functions/otaZipValidator.cjs');

const { protectCapgoBundle, verifyProtectedBundle } = require('../functions/otaCapgoCrypto.cjs');

async function main() {
  const version = process.argv[2];

  if (!version || !/^[0-9]{1,6}[.][0-9]{1,6}[.][0-9]{1,6}$/.test(version)) {
    throw new Error('Invalid bundle version');
  }

  const directory = path.join(os.homedir(), 'Documents', 'JapanFlow-OTA-Builds', version);

  const keyDirectory = path.join(
    os.homedir(),
    'Documents',
    'JapanFlow-Signing-Backup',
    'ota',
    'capgo'
  );

  const encryptedPath = path.join(directory, 'frontend.protected');

  const metadataPath = path.join(directory, 'capgo-metadata.json');

  if (fs.existsSync(encryptedPath) || fs.existsSync(metadataPath)) {
    throw new Error('Protected bundle already exists');
  }

  const zipPath = path.join(directory, 'frontend.zip');

  const size = fs.statSync(zipPath).size;

  if (size <= 0 || size > 100 * 1024 * 1024) {
    throw new Error('Invalid ZIP size');
  }

  const zip = fs.readFileSync(zipPath);

  const inspection = await inspectOtaZip(zip);

  const privateKey = fs.readFileSync(path.join(keyDirectory, 'japanflow-capgo-private.pem'));

  const publicKey = fs.readFileSync(path.join(keyDirectory, 'japanflow-capgo-public.pem'));

  try {
    const result = protectCapgoBundle(zip, privateKey);

    if (!verifyProtectedBundle(result, publicKey)) {
      throw new Error('Protected bundle verification failed');
    }

    const { encrypted, ...metadata } = result;

    fs.writeFileSync(encryptedPath, encrypted, { flag: 'wx' });

    try {
      fs.writeFileSync(
        metadataPath,
        JSON.stringify(
          {
            schemaVersion: 1,
            bundleVersion: version,
            format: 'capgo-rsa-aes-v1',
            ...metadata,
            inspection,
          },
          null,
          2
        ) + '\n',
        { flag: 'wx' }
      );
    } catch (error) {
      fs.unlinkSync(encryptedPath);
      throw error;
    }

    console.log('OTA ZIP: VERIFIED');
    console.log('ENCRYPTED BUNDLE: VERIFIED');
    console.log('ORIGINAL BYTES:', result.sizeBytes);
    console.log('PROTECTED BYTES:', result.encryptedSizeBytes);
    console.log('SHA256:', result.sha256);
    console.log('OUTPUT:', directory);
  } finally {
    privateKey.fill(0);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
