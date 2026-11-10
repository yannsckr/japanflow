import { useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';
import type { Ride } from './useMotoboyRides';
import { subscribeNativePosition } from './nativeLocation';

// API JavaScript do Google Maps: chave pública RESTRITA a Maps JavaScript API e origens permitidas.
// Nunca utilizar GOOGLE_MAPS_SERVER_KEY no navegador ou no APK.
type Geo = { lat: number; lng: number };
type GoogleMap = { setCenter: (point: Geo) => void; setZoom: (zoom: number) => void };
type GoogleMarker = { setMap: (map: GoogleMap | null) => void };
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
  Geocoder: new () => GoogleGeocoder;
  DirectionsRenderer: new (options: Record<string, unknown>) => GoogleDirectionsRenderer;
  DirectionsService: new () => GoogleDirectionsService;
};
declare global {
  interface Window {
    google?: { maps: GoogleMaps };
  }
}
const CITY_CENTER: Geo = { lat: -23.1896, lng: -45.8841 }; // Referência regional; não representa a loja.
let loading: Promise<GoogleMaps> | null = null;
const placeLocationCache = new Map<string, Geo>();
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
  const directionLayer = useRef<GoogleDirectionsRenderer | null>(null);
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
          label: 'L',
        })
      );
    rides.forEach((r, index) => {
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
            label: String(r.routeOrder ?? index + 1),
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
  // Traçado visual da próxima entrega. A navegação passo a passo abre no Google Maps.
  useEffect(() => {
    const maps = window.google?.maps;
    if (!loaded || !maps?.DirectionsService || !maps?.DirectionsRenderer || !instance.current)
      return;
    directionLayer.current?.setMap(null);
    directionLayer.current = null;
    const current = rides.find((ride) => ride.status === 'accepted') || rides[0];
    if (!current) return;
    const destination: Geo | string =
      current.destinationLat != null && current.destinationLng != null
        ? { lat: current.destinationLat, lng: current.destinationLng }
        : current.destinationPlaceId
          ? ({ placeId: current.destinationPlaceId } as unknown as Geo)
          : current.location;
    if (!destination || (typeof destination === 'string' && !destination.trim())) return;
    const start: Geo | null = position || (hasOrigin ? origin : resolvedOrigin);
    if (!start) {
      setError('Autorize o GPS ou configure a localização da loja para calcular o trajeto.');
      return;
    }
    const renderer = new maps.DirectionsRenderer({
      suppressMarkers: true,
      preserveViewport: false,
    });
    renderer.setMap(instance.current);
    directionLayer.current = renderer;
    let canceled = false;
    new maps.DirectionsService().route(
      { origin: start, destination, travelMode: 'DRIVING' },
      (result, status) => {
        if (canceled) return;
        if (status === 'OK' && result) {
          renderer.setDirections(result);
          setError('');
        } else {
          setError(
            `Não foi possível desenhar o trajeto (${status}). Verifique o destino e a API Routes/Directions.`
          );
        }
      }
    );
    return () => {
      canceled = true;
      renderer.setMap(null);
      if (directionLayer.current === renderer) directionLayer.current = null;
    };
  }, [loaded, rides, position, hasOrigin, origin, resolvedOrigin]);
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
