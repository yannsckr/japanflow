import { loadEnv } from 'vite';
const env = loadEnv('production', process.cwd(), 'VITE_');
const keys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];
const missing = keys.filter((k) => !env[k]?.trim());
const errors = [];
if (missing.length) errors.push(`Variaveis ausentes: ${missing.join(', ')}`);
if (env.VITE_FIREBASE_PROJECT_ID !== 'japanflow-erp')
  errors.push('Project ID diferente de japanflow-erp');
if (!/^AIza[A-Za-z0-9_-]{30,}$/.test(env.VITE_FIREBASE_API_KEY || ''))
  errors.push('API Key invalida/placeholder');
if (!/^japanflow-erp\.firebaseapp\.com$/.test(env.VITE_FIREBASE_AUTH_DOMAIN || ''))
  errors.push('Auth domain inesperado');
if (
  !/^japanflow-erp\.(firebasestorage\.app|appspot\.com)$/.test(
    env.VITE_FIREBASE_STORAGE_BUCKET || ''
  )
)
  errors.push('Storage bucket inesperado');
if (!/^\d+$/.test(env.VITE_FIREBASE_MESSAGING_SENDER_ID || '')) errors.push('Sender ID invalido');
if (!/^1:\d+:[^:]+:[0-9a-fA-F]+$/.test(env.VITE_FIREBASE_APP_ID || ''))
  errors.push('App ID invalido');
if (env.VITE_USE_FIREBASE_EMULATORS === 'true')
  errors.push('Emuladores habilitados no build de producao');
if (errors.length) {
  for (const e of errors) console.error('BLOQUEADO:', e);
  process.exit(1);
}
console.log('OK: configuracao do Firebase de producao presente, formato e projeto corretos.');
console.log(
  'A verificacao nao testa a validade da chave no servidor. Confirme o login na homologacao.'
);
