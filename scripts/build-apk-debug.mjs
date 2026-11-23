/**
 * JapanFlow: builds the Android debug APK, bumping versionCode/versionName
 * only for a successfully generated APK. No push or deployment.
 * Requires the existing cosmos:android:sync script (dist-android).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const gradle = join(root, 'android', 'app', 'build.gradle');
const android = join(root, 'android');
const output = join(android, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const distDir = join(root, 'apk-local');

function parseVersion(content) {
  const codeRe = /^(\s*versionCode\s+)(\d+)(\s*)$/gm;
  const nameRe = /^(\s*versionName\s+)(["'])(\d+)\.(\d+)\.(\d+)\2(\s*)$/gm;
  const codes = [...content.matchAll(codeRe)];
  const names = [...content.matchAll(nameRe)];
  if (codes.length !== 1 || names.length !== 1) {
    throw new Error(
      'Formato de versionCode/versionName inesperado em android/app/build.gradle; nenhuma alteracao feita.'
    );
  }
  const code = Number(codes[0][2]);
  const major = Number(names[0][3]);
  const minor = Number(names[0][4]);
  const patch = Number(names[0][5]);
  if (![code, major, minor, patch].every(Number.isSafeInteger) || code >= 2100000000) {
    throw new Error('Versao atual invalida ou fora do intervalo.');
  }
  const nextCode = code + 1;
  const nextName = `${major}.${minor}.${patch + 1}`;
  const updated = content
    .replace(codeRe, (_, before, _number, after) => `${before}${nextCode}${after}`)
    .replace(
      nameRe,
      (_, before, quote, _major, _minor, _patch, after) =>
        `${before}${quote}${nextName}${quote}${after}`
    );
  return { code, name: `${major}.${minor}.${patch}`, nextCode, nextName, updated };
}

function run(command, args, cwd = root) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Falha no comando ${command} ${args.join(' ')} (codigo ${result.status}).`);
}

if (!existsSync(gradle)) throw new Error(`Gradle nao encontrado: ${gradle}`);
const original = readFileSync(gradle, 'utf8');
const version = parseVersion(original);
const target = join(distDir, `JapanFlow-${version.nextName}-code${version.nextCode}-debug.apk`);
if (existsSync(target)) throw new Error(`APK dessa versao ja existe: ${target}. Nao sobrescrever.`);

console.log(
  `\nJapanFlow APK Debug: ${version.name} (${version.code}) -> ${version.nextName} (${version.nextCode})`
);
console.log('Rodando validacoes ANTES de incrementar a versao...');
run('npm', ['run', 'typecheck']);
run('npm', ['run', 'lint']);
run('npm', ['run', 'format:check']);
run('npm', ['run', 'cosmos:android:sync']);

// Only the Gradle assembly needs the bumped version. Restore on any failure.
let applied = false;
try {
  writeFileSync(gradle, version.updated, 'utf8');
  applied = true;
  const wrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  run(wrapper, ['assembleDebug'], android);
  if (!existsSync(output)) throw new Error('Gradle finalizou sem criar app-debug.apk.');
  mkdirSync(distDir, { recursive: true });
  copyFileSync(output, target);
  console.log(`\nAPK gerada: ${target}`);
  console.log(`Versao gravada: ${version.nextName} (versionCode ${version.nextCode})`);
  console.log('Nenhum push, merge ou deploy realizado.');
} catch (error) {
  if (applied) {
    writeFileSync(gradle, original, 'utf8');
    console.error('Compilacao falhou: versionCode e versionName restaurados.');
  }
  throw error;
}
