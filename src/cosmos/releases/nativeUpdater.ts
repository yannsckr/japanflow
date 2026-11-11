import { Capacitor, registerPlugin } from '@capacitor/core';

export type DownloadProgress = {
  status: 'downloading' | 'complete' | 'error';
  percent: number;
  message: string;
};
interface UpdaterPlugin {
  getVersion(): Promise<{ version: string; versionCode: number }>;
  downloadApk(options: { url: string }): Promise<void>;
  installApk(): Promise<void>;
  addListener(
    eventName: 'progress',
    callback: (event: DownloadProgress) => void
  ): Promise<{ remove(): Promise<void> }>;
}
const updater = registerPlugin<UpdaterPlugin>('JapanFlowUpdater');
export const isNativeAndroid = () => Capacitor.getPlatform() === 'android';
export async function installedVersion(): Promise<string> {
  if (isNativeAndroid()) return (await updater.getVersion()).version;
  return import.meta.env.VITE_COSMOS_APP_VERSION || '0.0.0';
}
export const nativeUpdater = updater;
