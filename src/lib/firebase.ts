import { Capacitor, registerPlugin } from '@capacitor/core';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

interface NativeAppCheckPlugin {
  getToken(): Promise<{
    token: string;
    expireTimeMillis: number;
  }>;
}

const nativeAppCheck = registerPlugin<NativeAppCheckPlugin>('JapanFlowAppCheck');

if (
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === 'android' &&
  import.meta.env.VITE_USE_FIREBASE_EMULATORS !== 'true'
) {
  initializeAppCheck(app, {
    provider: new CustomProvider({
      getToken: async () => {
        if (!Capacitor.isPluginAvailable('JapanFlowAppCheck')) {
          throw new Error('Native App Check plugin unavailable');
        }

        const result = await nativeAppCheck.getToken();

        if (
          !result.token ||
          !Number.isFinite(result.expireTimeMillis) ||
          result.expireTimeMillis <= Date.now()
        ) {
          throw new Error('Invalid native App Check token');
        }

        return result;
      },
    }),
    isTokenAutoRefreshEnabled: true,
  });
}

const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY;

if (
  !Capacitor.isNativePlatform() &&
  import.meta.env.PROD &&
  import.meta.env.VITE_USE_FIREBASE_EMULATORS !== 'true' &&
  appCheckSiteKey
) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
    disableWarnings: true,
  });

  connectFirestoreEmulator(db, '127.0.0.1', 8085);

  connectStorageEmulator(storage, '127.0.0.1', 9199);
  connectFunctionsEmulator(getFunctions(app, 'southamerica-east1'), '127.0.0.1', 5001);

  console.info('JapanFlow QA: Firebase Emulator ativo');
}

export default app;
