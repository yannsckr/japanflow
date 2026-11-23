'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const tests = [
  [
    'função segura de sessão',
    () => {
      const s = read('functions/motoboyNativeSession.cjs');
      assert(s.includes('auth_links/'));
      assert(s.includes("includes('motoboys')"));
      assert(s.includes('motoboy_journeys/'));
      assert(s.includes('createCustomToken(uid)'));
    },
  ],
  [
    'serviço nativo protegido',
    () => {
      const s = read('android/app/src/main/java/com/japanflow/mobile/JapanFlowGpsService.java');
      assert(s.includes('ACTION_STOP'));
      assert(s.includes('onDestroy()'));
      assert(s.includes('FirebaseFirestore.getInstance()'));
      assert(s.includes('getAccuracy() > 150'));
      assert(s.includes('America/Sao_Paulo'));
    },
  ],
  [
    'permissão de localização',
    () => {
      const s = read('android/app/src/main/AndroidManifest.xml');
      assert(s.includes('foregroundServiceType="location"'));
      assert(s.includes('android:exported="false"'));
    },
  ],
  [
    'jornada e consentimento',
    () => {
      const s = read('src/cosmos/mobile/roles/motoboy/useJourneyGpsRecording.ts');
      assert(s.includes('japanflow:location-opt-in:'));
      assert(s.includes('stopNativeGpsTransport'));
      assert(s.includes('startNativeGpsTransport'));
    },
  ],
  [
    'backend exportado',
    () => {
      assert(read('functions/index.js').includes('exports.motoboyNativeSession'));
    },
  ],
];
for (const [label, fn] of tests) {
  fn();
  console.log('PASS', label);
}
console.log('Observação: testes estáticos NÃO substituem build Android e teste em aparelho real.');
