// Shared browser loader for the operational and Android maps.
// Only the restricted browser key belongs here, never the server key.
type MapsNamespace = Record<string, unknown>;
const constructors = ['Map', 'Marker', 'Geocoder', 'Polyline', 'LatLngBounds', 'Size', 'Point'];
const callbackName = '__japanFlowGoogleMapsReady';
let pending: Promise<MapsNamespace> | null = null;

function namespace(): MapsNamespace | undefined {
  return (window as unknown as { google?: { maps?: MapsNamespace } }).google?.maps;
}

function ready(): MapsNamespace | undefined {
  const maps = namespace();
  return maps && constructors.every((name) => typeof maps[name] === 'function') ? maps : undefined;
}

function loadOnce(key: string): Promise<MapsNamespace> {
  const existing = ready();
  if (existing) return Promise.resolve(existing);
  if (pending) return pending;

  pending = new Promise<MapsNamespace>((resolve, reject) => {
    let script = Array.from(document.scripts).find((item) =>
      item.src.startsWith('https://maps.googleapis.com/maps/api/js?')
    );
    const owned = !script;
    if (!script) {
      script = document.createElement('script');
      script.async = true;
      script.src =
        'https://maps.googleapis.com/maps/api/js?' +
        new URLSearchParams({ key, v: 'weekly', loading: 'async', callback: callbackName });
    }
    const element = script;
    let settled = false;
    let importing = false;
    const cleanup = () => {
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      element.removeEventListener('error', onError);
      element.removeEventListener('load', check);
      // Keep a harmless callback for a script that completes after a timeout.
      if (owned) Reflect.set(window, callbackName, () => undefined);
    };
    const fail = (message: string, remove: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (remove && owned) element.remove();
      reject(new Error(message));
    };
    const check = () => {
      if (settled) return;
      const maps = ready();
      if (maps) {
        settled = true;
        cleanup();
        resolve(maps);
        return;
      }
      const api = namespace();
      if (!importing && api && typeof api.importLibrary === 'function') {
        importing = true;
        const load = api.importLibrary as (name: string) => Promise<unknown>;
        void Promise.all(
          ['maps', 'marker', 'geocoding', 'core'].map((name) => load.call(api, name))
        )
          .then(check)
          .catch(() => undefined);
      }
    };
    const onError = () => fail('Falha de conexão com o Google Maps.', true);
    const poll = window.setInterval(check, 200);
    const timeout = window.setTimeout(() => {
      // Do not inject a duplicate API if the original script is merely slow.
      fail('Google Maps não respondeu. Verifique a conexão e tente novamente.', false);
    }, 20000);
    element.addEventListener('error', onError);
    element.addEventListener('load', check);
    if (owned) {
      Reflect.set(window, callbackName, check);
      document.head.appendChild(element);
    }
    check();
  }).finally(() => {
    pending = null;
  });
  return pending;
}

export async function loadJapanFlowGoogleMaps<T>(key: string): Promise<T> {
  if (!key.trim()) throw new Error('Chave de exibição do Google Maps não configurada.');
  let failure: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return (await loadOnce(key)) as T;
    } catch (error) {
      failure = error;
      if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
  }
  throw failure;
}
