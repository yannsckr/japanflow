import { registerPlugin } from '@capacitor/core';

// Plugin nativo; instalar @capacitor-community/background-geolocation antes do cap sync.
type NativePosition = {
  latitude: number;
  longitude: number;
  accuracy: number;
  time: number | null;
};
type NativeLocationError = { code?: string; message?: string };
type LocationPlugin = {
  addWatcher(
    options: {
      backgroundTitle: string;
      backgroundMessage: string;
      requestPermissions: boolean;
      stale: boolean;
      distanceFilter: number;
    },
    callback: (position?: NativePosition, error?: NativeLocationError) => void
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
};
const NativeLocation = registerPlugin<LocationPlugin>('BackgroundGeolocation');
let watcherId: string | null = null;
let watcherStarting: Promise<string> | null = null;

export async function startLocationWatcher(
  onLocation: (position: NativePosition) => void,
  onError: (message: string) => void
): Promise<void> {
  if (watcherId) return;
  if (watcherStarting) {
    await watcherStarting;
    return;
  }
  watcherStarting = NativeLocation.addWatcher(
    {
      backgroundTitle: 'JapanFlow • Rota em andamento',
      backgroundMessage: 'Localização ativa durante a jornada. Encerre pelo aplicativo.',
      requestPermissions: true,
      stale: false,
      distanceFilter: 25,
    },
    (position, error) => {
      if (error) {
        onError(error.message || 'Falha ao receber localização');
        return;
      }
      if (position) onLocation(position);
    }
  );
  try {
    watcherId = await watcherStarting;
  } finally {
    watcherStarting = null;
  }
}

export async function stopLocationWatcher(): Promise<void> {
  if (watcherStarting) await watcherStarting;
  if (!watcherId) return;
  await NativeLocation.removeWatcher({ id: watcherId });
  watcherId = null;
}
