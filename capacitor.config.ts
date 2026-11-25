import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.japanflow.mobile',
  appName: 'JapanFlow',
  webDir: 'dist-android',
  server: { androidScheme: 'https' },
  android: { useLegacyBridge: true },
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false,
      appReadyTimeout: 30000,
      autoDeleteFailed: true,
      autoDeletePrevious: false,
      statsUrl: '',
      updateUrl: '',
      channelUrl: '',
    },
  },
};

export default config;
