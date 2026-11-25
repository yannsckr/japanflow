'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validEntryName,
  inspectOtaZip,
} = require('../otaZipValidator.cjs');

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^
        ((crc & 1) ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const local = [];
  const central = [];

  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.data || '');
    const checksum = crc32(data);

    const header = Buffer.alloc(30);

    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);

    local.push(header, name, data);

    const directory = Buffer.alloc(46);

    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(0x0314, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(name.length, 28);

    directory.writeUInt32LE(
      entry.mode === undefined
        ? 0x81a40000
        : (entry.mode << 16) >>> 0,
      38
    );

    directory.writeUInt32LE(offset, 42);

    central.push(directory, name);

    offset += header.length + name.length + data.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);

  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([
    ...local,
    directory,
    end,
  ]);
}

const validEntries = () => [
  { name: 'index.html', data: '<html></html>' },
  { name: 'assets/main.js', data: 'console.log("ok")' },
];

test('accepts frontend asset paths', () => {
  assert.equal(validEntryName('assets/main.js'), true);
});

test('rejects parent directory traversal', () => {
  assert.equal(validEntryName('../index.html'), false);
});

test('rejects absolute paths', () => {
  assert.equal(validEntryName('/index.html'), false);
});

test('rejects Windows paths', () => {
  assert.equal(validEntryName('C:\\test.js'), false);
});

test('rejects private key files', () => {
  assert.equal(validEntryName('private.pem'), false);
});

test('rejects APK files', () => {
  assert.equal(validEntryName('app.apk'), false);
});

test('accepts a valid frontend ZIP', async () => {
  const result = await inspectOtaZip(
    makeZip(validEntries())
  );

  assert.equal(result.hasIndex, true);
  assert.equal(result.hasJavaScript, true);
  assert.equal(result.entryCount, 2);
});

test('rejects invalid ZIP content', async () => {
  await assert.rejects(
    inspectOtaZip(Buffer.from('invalid'))
  );
});

test('requires root index.html', async () => {
  await assert.rejects(
    inspectOtaZip(
      makeZip([
        { name: 'folder/index.html', data: 'html' },
        { name: 'main.js', data: 'test' },
      ])
    )
  );
});

test('requires JavaScript content', async () => {
  await assert.rejects(
    inspectOtaZip(
      makeZip([
        { name: 'index.html', data: 'html' },
      ])
    )
  );
});

test('rejects duplicate paths', async () => {
  await assert.rejects(
    inspectOtaZip(
      makeZip([
        ...validEntries(),
        { name: 'INDEX.HTML', data: 'duplicate' },
      ])
    )
  );
});

test('rejects symbolic links', async () => {
  await assert.rejects(
    inspectOtaZip(
      makeZip([
        ...validEntries(),
        {
          name: 'link',
          data: '../outside',
          mode: 0xa1ff,
        },
      ])
    )
  );
});

test('rejects empty archives', async () => {
  await assert.rejects(
    inspectOtaZip(makeZip([]))
  );
});

test('rejects nested traversal paths', async () => {
  await assert.rejects(
    inspectOtaZip(
      makeZip([
        ...validEntries(),
        { name: 'assets/../../escape.js', data: 'test' },
      ])
    )
  );
});

test('rejects embedded native executables', async () => {
  await assert.rejects(
    inspectOtaZip(
      makeZip([
        ...validEntries(),
        { name: 'native.so', data: 'test' },
      ])
    )
  );
});
