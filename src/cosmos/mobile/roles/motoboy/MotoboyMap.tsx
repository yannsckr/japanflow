import { useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '@/lib/firebase';
import type { Ride } from './useMotoboyRides';
import { subscribeNativePosition } from './nativeLocation';
import storePin from '@/assets/japanflow-store-pin.png';

// API JavaScript do Google Maps: chave pública RESTRITA a Maps JavaScript API e origens permitidas.
// Nunca utilizar GOOGLE_MAPS_SERVER_KEY no navegador ou no APK.
type Geo = { lat: number; lng: number };
type GoogleMap = {
  setCenter: (point: Geo) => void;
  setZoom: (zoom: number) => void;
  fitBounds: (bounds: unknown) => void;
};
type GoogleMarker = { setMap: (map: GoogleMap | null) => void };
type GooglePolyline = { setMap: (map: GoogleMap | null) => void };
type GoogleDirectionsRenderer = {
  setMap: (map: GoogleMap | null) => void;
  setDirections: (directions: unknown) => void;
};
type GoogleDirectionsService = {
  route: (
    request: {
      origin: Geo | string;
      destination: Geo | string;
      travelMode: string;
    },
    callback: (result: unknown, status: string) => void
  ) => void;
};
type GeocodeResult = { geometry: { location: { lat: () => number; lng: () => number } } };
type GoogleGeocoder = {
  geocode: (request: { placeId: string }) => Promise<{ results: GeocodeResult[] }>;
};
type GoogleMaps = {
  Map: new (element: HTMLElement, opts: Record<string, unknown>) => GoogleMap;
  Marker: new (opts: Record<string, unknown>) => GoogleMarker;
  Size: new (width: number, height: number) => unknown;
  Geocoder: new () => GoogleGeocoder;
  DirectionsRenderer: new (options: Record<string, unknown>) => GoogleDirectionsRenderer;
  DirectionsService: new () => GoogleDirectionsService;
  Polyline: new (options: Record<string, unknown>) => GooglePolyline;
  LatLngBounds: new () => { extend: (point: Geo) => void };
};
declare global {
  interface Window {
    google?: { maps: GoogleMaps };
  }
}
const CITY_CENTER: Geo = { lat: -23.1896, lng: -45.8841 }; // Referência regional; não representa a loja.
let loading: Promise<GoogleMaps> | null = null;
const placeLocationCache = new Map<string, Geo>();
const routeFunction = httpsCallable<
  { action: string; rideId: string },
  { polyline: string; distanceMeters: number }
>(getFunctions(app, 'southamerica-east1'), 'googleRoutePlanner');
function decodePolyline(encoded: string): Geo[] {
  const result: Geo[] = [];
  let index = 0,
    lat = 0,
    lng = 0;
  while (index < encoded.length) {
    const values: number[] = [];
    for (let n = 0; n < 2; n++) {
      let shift = 0,
        value = 0,
        byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        value |= (byte & 31) << shift;
        shift += 5;
      } while (byte >= 32 && index < encoded.length);
      values.push(value & 1 ? ~(value >> 1) : value >> 1);
    }
    lat += values[0];
    lng += values[1];
    result.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return result;
}
function loadMaps(key: string): Promise<GoogleMaps> {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (loading) return loading;
  loading = new Promise<GoogleMaps>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async`;
    script.async = true;
    script.onload = () =>
      window.google?.maps?.Map
        ? resolve(window.google.maps)
        : reject(new Error('Google Maps indisponível'));
    script.onerror = () =>
      reject(new Error('Falha ao carregar o Google Maps. Verifique a chave e suas restrições.'));
    document.head.appendChild(script);
  }).catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}
export default function MotoboyMap({ rides = [] }: { rides?: Ride[] }) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<GoogleMap | null>(null);
  const markers = useRef<GoogleMarker[]>([]);
  const directionLayer = useRef<GooglePolyline | null>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [placeLocations, setPlaceLocations] = useState<Record<string, Geo>>({});
  const [resolvedOrigin, setResolvedOrigin] = useState<Geo | null>(null);
  const [position, setPosition] = useState<Geo | null>(null);
  const key = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const storePlaceId = import.meta.env.VITE_GOOGLE_STORE_PLACE_ID as string | undefined;
  const storeLat = Number(import.meta.env.VITE_GOOGLE_STORE_LAT);
  const storeLng = Number(import.meta.env.VITE_GOOGLE_STORE_LNG);
  const hasOrigin =
    Number.isFinite(storeLat) && Number.isFinite(storeLng) && storeLat !== 0 && storeLng !== 0;
  const origin = useMemo<Geo>(
    () => (hasOrigin ? { lat: storeLat, lng: storeLng } : CITY_CENTER),
    [hasOrigin, storeLat, storeLng]
  );
  useEffect(() => {
    if (!key || !container.current) {
      setError('O mapa Google aguarda a chave de exibição VITE_GOOGLE_MAPS_BROWSER_KEY.');
      return;
    }
    let disposed = false;
    loadMaps(key)
      .then((maps) => {
        if (disposed || !container.current) return;
        instance.current = new maps.Map(container.current, {
          center: position || origin,
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          gestureHandling: 'greedy',
        });
        setLoaded(true);
        setError('');
      })
      .catch((cause) => {
        if (!disposed) setError(cause instanceof Error ? cause.message : 'Mapa indisponível');
      });
    return () => {
      disposed = true;
      directionLayer.current?.setMap(null);
      directionLayer.current = null;
      markers.current.forEach((m) => m.setMap(null));
      markers.current = [];
      instance.current = null;
    };
    // O mapa é instanciado uma vez por montagem; marcadores atualizam no efeito abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!loaded || !window.google?.maps?.Geocoder) return;
    let canceled = false;
    const geocoder = new window.google.maps.Geocoder();
    // Dados de geocodificação apenas em memória, para exibição neste mapa Google.
    const missing = rides.filter(
      (r) =>
        r.destinationLat == null &&
        r.destinationLng == null &&
        r.destinationPlaceId &&
        !placeLocationCache.has(r.destinationPlaceId)
    );
    const resolve = async () => {
      if (!hasOrigin && storePlaceId) {
        try {
          let point = placeLocationCache.get(storePlaceId);
          if (!point) {
            const result = await geocoder.geocode({ placeId: storePlaceId });
            const location = result.results?.[0]?.geometry?.location;
            if (location) {
              point = { lat: location.lat(), lng: location.lng() };
              placeLocationCache.set(storePlaceId, point);
            }
          }
          if (point && !canceled) {
            setResolvedOrigin(point);
            instance.current?.setCenter(point);
          }
        } catch {
          /* Sem ponto fictício para a loja. */
        }
      }
      for (const ride of missing) {
        if (canceled || !ride.destinationPlaceId) break;
        try {
          const result = await geocoder.geocode({ placeId: ride.destinationPlaceId });
          const point = result.results?.[0]?.geometry?.location;
          if (point)
            placeLocationCache.set(ride.destinationPlaceId, { lat: point.lat(), lng: point.lng() });
        } catch {
          /* Mantém a corrida na lista mesmo sem localização no mapa. */
        }
      }
      if (!canceled) setPlaceLocations(Object.fromEntries(placeLocationCache));
    };
    void resolve();
    return () => {
      canceled = true;
    };
  }, [rides, loaded, hasOrigin, storePlaceId]);
  useEffect(() => {
    if (!instance.current || !window.google?.maps) return;
    markers.current.forEach((marker) => marker.setMap(null));
    markers.current = [];
    const maps = window.google.maps;
    const actualOrigin = hasOrigin ? origin : resolvedOrigin;
    if (actualOrigin)
      markers.current.push(
        new maps.Marker({
          map: instance.current,
          position: actualOrigin,
          title: 'Japan Imports — origem',
          icon: { url: storePin, scaledSize: new maps.Size(46, 46) },
        })
      );
    const orderedRides = [...rides].sort((a, b) => (a.routeOrder ?? 9999) - (b.routeOrder ?? 9999));
    orderedRides.forEach((r, index) => {
      const point =
        r.destinationLat != null && r.destinationLng != null
          ? { lat: r.destinationLat, lng: r.destinationLng }
          : r.destinationPlaceId
            ? placeLocations[r.destinationPlaceId]
            : undefined;
      if (point)
        markers.current.push(
          new maps.Marker({
            map: instance.current,
            position: point,
            title: r.clientName || r.location,
            label: {
              text: String(index + 1),
              color: '#ffffff',
              fontWeight: '700',
              fontSize: '13px',
            },
          })
        );
    });
    if (position) {
      markers.current.push(
        new maps.Marker({ map: instance.current, position, title: 'Minha localização' })
      );
    }
  }, [rides, position, placeLocations, resolvedOrigin, origin.lat, origin.lng, hasOrigin, loaded]);
  // Usar posição nativa do GPS se um watcher estiver ativo no Android.
  useEffect(() => subscribeNativePosition(setPosition), []);
  // O servidor calcula trajetos pela Routes API. A chave de servidor nunca chega ao APK.
  // Recalcula somente se a lista de entregas mudar, não a cada atualização do GPS.
  const nextRide =
    rides.find((ride) => ride.status === 'accepted') ||
    rides.find((ride) => ride.status === 'pending');
  const rideId = nextRide?.id || '';
  const routeKey = nextRide?.routeId || '';
  useEffect(() => {
    const maps = window.google?.maps;
    if (!loaded || !maps?.Polyline || !instance.current || !rideId) return;
    let canceled = false;
    directionLayer.current?.setMap(null);
    directionLayer.current = null;
    void routeFunction({ action: 'draw', rideId })
      .then(({ data }) => {
        if (canceled || !instance.current) return;
        const path = decodePolyline(data.polyline || '');
        if (!path.length) throw new Error('Trajeto vazio retornado pelo Google.');
        const line = new maps.Polyline({
          map: instance.current,
          path,
          strokeColor: '#214E42',
          strokeWeight: 5,
          strokeOpacity: 0.9,
        });
        directionLayer.current = line;
        const bounds = new maps.LatLngBounds();
        path.forEach((point) => bounds.extend(point));
        instance.current.fitBounds(bounds);
        setError('');
      })
      .catch((reason: unknown) => {
        if (canceled) return;
        const message = reason instanceof Error ? reason.message : 'Erro ao buscar rota';
        setError(`Não foi possível traçar a rota: ${message}`);
      });
    return () => {
      canceled = true;
      directionLayer.current?.setMap(null);
      directionLayer.current = null;
    };
  }, [loaded, rideId, routeKey]);
  const locate = () => {
    if (!navigator.geolocation) {
      setError('GPS não disponível');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const next = { lat: coords.latitude, lng: coords.longitude };
        setPosition(next);
        instance.current?.setCenter(next);
        instance.current?.setZoom(15);
      },
      () => setError('Localização não autorizada.'),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };
  return (
    <div className="jf-moto-map jf-google-map-wrap">
      <div ref={container} className="jf-moto-map-layer" aria-label="Mapa Google de entregas" />
      {error && (
        <div className="jf-google-map-warning" role="status">
          <MapPin size={17} />
          <span>{error}</span>
        </div>
      )}
      <button
        className="jf-moto-locate"
        type="button"
        onClick={locate}
        aria-label="Localizar minha posição"
      >
        <LocateFixed size={20} />
      </button>
    </div>
  );
}
