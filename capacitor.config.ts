import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.japanflow.mobile',
  appName: 'JapanFlow',
  webDir: 'dist-android',
  server: { androidScheme: 'https' },
  android: { useLegacyBridge: true },
};

export default config;
