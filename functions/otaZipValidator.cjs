'use strict';

const yauzl = require('yauzl');

const LIMITS = {
  archiveBytes: 100 * 1024 * 1024,
  totalBytes: 250 * 1024 * 1024,
  entryBytes: 50 * 1024 * 1024,
  entries: 5000,
};

function validEntryName(name) {
  if (
    typeof name !== 'string' ||
    !name ||
    name.length > 500 ||
    name.startsWith('/') ||
    name.includes('\\') ||
    name.includes('\0') ||
    /[\x00-\x1f\x7f]/.test(name) ||
    /^[A-Za-z]:/.test(name)
  ) {
    return false;
  }

  const clean = name.endsWith('/')
    ? name.slice(0, -1)
    : name;

  const parts = clean.split('/');

  if (
    parts.some(
      part => !part || part === '.' || part === '..'
    )
  ) {
    return false;
  }

  return !/\.(apk|aab|exe|dll|so|dex|msi|bat|cmd|ps1|jks|keystore|pem|p12|pfx)$/i.test(
    clean
  );
}

function inspectOtaZip(buffer) {
  return new Promise((resolve, reject) => {
    if (
      !Buffer.isBuffer(buffer) ||
      buffer.length === 0 ||
      buffer.length > LIMITS.archiveBytes
    ) {
      reject(new Error('Invalid OTA archive size'));
      return;
    }

    yauzl.fromBuffer(
      buffer,
      {
        lazyEntries: true,
        validateEntrySizes: true,
        strictFileNames: true,
        autoClose: false,
      },
      (openError, zip) => {
        if (openError || !zip) {
          reject(openError || new Error('Invalid ZIP'));
          return;
        }

        let settled = false;
        let totalBytes = 0;
        let entryCount = 0;
        let hasIndex = false;
        let hasJavaScript = false;

        const names = new Set();

        function fail(error) {
          if (settled) return;
          settled = true;
          zip.close();
          reject(error);
        }

        zip.on('error', fail);

        zip.on('entry', entry => {
          if (settled) return;

          try {
            entryCount++;

            if (entryCount > LIMITS.entries) {
              throw new Error('Too many ZIP entries');
            }

            const name = entry.fileName;

            if (!validEntryName(name)) {
              throw new Error('Unsafe ZIP entry name');
            }

            const normalized = name
              .replace(/\/$/, '')
              .normalize('NFC')
              .toLowerCase();

            if (names.has(normalized)) {
              throw new Error('Duplicate ZIP entry');
            }

            names.add(normalized);

            if (entry.generalPurposeBitFlag & 1) {
              throw new Error('Encrypted ZIP entry');
            }

            const mode =
              (entry.externalFileAttributes >>> 16) & 0xffff;

            const fileType = mode & 0xf000;

            if (
              fileType !== 0 &&
              fileType !== 0x8000 &&
              fileType !== 0x4000
            ) {
              throw new Error('Unsupported ZIP file type');
            }

            if (
              !Number.isSafeInteger(entry.uncompressedSize) ||
              entry.uncompressedSize < 0 ||
              entry.uncompressedSize > LIMITS.entryBytes
            ) {
              throw new Error('Invalid ZIP entry size');
            }

            if (name.endsWith('/')) {
              if (entry.uncompressedSize !== 0) {
                throw new Error('Invalid ZIP directory');
              }

              zip.readEntry();
              return;
            }

            if (
              totalBytes + entry.uncompressedSize >
              LIMITS.totalBytes
            ) {
              throw new Error('Archive expansion limit exceeded');
            }

            zip.openReadStream(entry, (streamError, stream) => {
              if (streamError || !stream) {
                fail(streamError || new Error('Unreadable ZIP entry'));
                return;
              }

              let bytes = 0;

              stream.on('error', fail);

              stream.on('data', chunk => {
                if (settled) return;

                bytes += chunk.length;
                totalBytes += chunk.length;

                if (
                  bytes > LIMITS.entryBytes ||
                  totalBytes > LIMITS.totalBytes
                ) {
                  stream.destroy();
                  fail(new Error('ZIP expansion limit exceeded'));
                }
              });

              stream.on('end', () => {
                if (settled) return;

                if (bytes !== entry.uncompressedSize) {
                  fail(new Error('ZIP size mismatch'));
                  return;
                }

                if (name === 'index.html' && bytes > 0) {
                  hasIndex = true;
                }

                if (name.endsWith('.js') && bytes > 0) {
                  hasJavaScript = true;
                }

                zip.readEntry();
              });
            });
          } catch (error) {
            fail(error);
          }
        });

        zip.on('end', () => {
          if (settled) return;

          if (!hasIndex || !hasJavaScript) {
            fail(new Error('Android frontend entrypoint missing'));
            return;
          }

          settled = true;

          zip.close();

          resolve({
            entryCount,
            totalBytes,
            hasIndex,
            hasJavaScript,
          });
        });

        zip.readEntry();
      }
    );
  });
}

module.exports = {
  LIMITS,
  validEntryName,
  inspectOtaZip,
};
