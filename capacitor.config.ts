import { OTA_CAPGO_PUBLIC_KEY } from './src/releases/ota/otaCapgoPublicKey';
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.japanflow.mobile',
  appName: 'JapanFlow',
  webDir: 'dist-android',
  server: { androidScheme: 'https' },
  android: { useLegacyBridge: true },
  plugins: {
    CapacitorUpdater: {
      publicKey: OTA_CAPGO_PUBLIC_KEY,
      autoUpdate: false,
      allowPreview: false,
      allowModifyUrl: false,
      shakeMenu: false,
      allowShakeChannelSelector: false,
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
