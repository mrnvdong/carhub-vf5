import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  GeoJSONSource,
  LngLatBounds,
  StyleSpecification,
  setWorkerUrl,
} from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Navigation,
  LocateFixed,
  Compass,
  Maximize2,
  Minimize2,
  Search,
  Zap,
  X,
  Bell,
  BellOff,
  Layers,
  Loader2,
  Flag,
  Video as CameraIcon,
  AlertTriangle,
  ArrowLeftRight,
  Columns2,
  Play,
} from 'lucide-react';
import { CockpitTelemetry } from '../hooks/useCockpitTelemetry';

setWorkerUrl(maplibreWorkerUrl);

type MapTheme = 'vector3d' | 'dark3d' | 'osm' | 'satellite';

const LIBERTY_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
let cachedLibertyBaseJson: any = null;
let cachedDark3DStyle: StyleSpecification | null = null;

// Biến đổi trực tiếp bộ layer 3D Liberty sang giao diện "3D Đêm" độ tương phản cao chuẩn màn ô tô
// (Giữ nguyên khối nhà nổi 3D building-3d + đường cao tốc vàng cam + đường phố xanh xám sáng rõ!)
async function buildAutomotiveDark3DStyle(): Promise<StyleSpecification | string> {
  if (cachedDark3DStyle) return cachedDark3DStyle;

  try {
    if (!cachedLibertyBaseJson) {
      const res = await fetch(LIBERTY_STYLE_URL);
      if (!res.ok) throw new Error('Failed to load Liberty base style');
      cachedLibertyBaseJson = await res.json();
    }

    const spec = JSON.parse(JSON.stringify(cachedLibertyBaseJson));
    for (const layer of spec.layers || []) {
      const id = String(layer.id || '');
      const type = String(layer.type || '');
      layer.paint = layer.paint || {};

      if (type === 'background') {
        layer.paint['background-color'] = '#0b1220';
      } else if (id === 'natural_earth') {
        layer.paint['raster-opacity'] = 0;
      } else if (layer.paint['fill-pattern']) {
        layer.paint['fill-opacity'] = 0.12;
      } else if (id.includes('water') && type === 'fill') {
        layer.paint['fill-color'] = '#0a2e4d';
      } else if (id.includes('waterway') && type === 'line') {
        layer.paint['line-color'] = '#0f416c';
      } else if (id === 'park_outline' && type === 'line') {
        layer.paint['line-color'] = '#13332a';
      } else if (
        type === 'fill' &&
        (id.includes('park') ||
          id.includes('wood') ||
          id.includes('grass') ||
          id.includes('wetland') ||
          id.includes('pitch') ||
          id.includes('cemetery'))
      ) {
        layer.paint['fill-color'] = '#0d2620';
        layer.paint['fill-opacity'] = 0.8;
        if (layer.paint['fill-outline-color']) {
          layer.paint['fill-outline-color'] = '#14382f';
        }
      } else if (
        type === 'fill' &&
        (id.includes('landuse') ||
          id.includes('sand') ||
          id.includes('ice') ||
          id.includes('aeroway'))
      ) {
        layer.paint['fill-color'] = '#0f1829';
        layer.paint['fill-opacity'] = 0.75;
      } else if (id === 'building' && type === 'fill') {
        layer.paint['fill-color'] = '#162238';
        layer.paint['fill-outline-color'] = '#223352';
      } else if (id === 'building-3d' && type === 'fill-extrusion') {
        layer.paint['fill-extrusion-color'] = '#1e304f';
        layer.paint['fill-extrusion-opacity'] = 0.88;
      } else if (type === 'line' && id.includes('casing')) {
        layer.paint['line-color'] = '#060a12';
      } else if (type === 'line' && id.includes('motorway')) {
        layer.paint['line-color'] = '#f59e0b';
      } else if (type === 'line' && id.includes('trunk_primary')) {
        layer.paint['line-color'] = '#4b6999';
      } else if (type === 'line' && (id.includes('secondary_tertiary') || id.includes('link'))) {
        layer.paint['line-color'] = '#385076';
      } else if (type === 'line' && id.includes('rail')) {
        layer.paint['line-color'] = '#29374d';
      } else if (
        type === 'line' &&
        (id.includes('minor') ||
          id.includes('street') ||
          id.includes('service') ||
          id.includes('pedestrian') ||
          id.includes('path') ||
          id.includes('aeroway'))
      ) {
        layer.paint['line-color'] = '#283a56';
      } else if (type === 'line' && id.includes('boundary')) {
        layer.paint['line-color'] = '#334155';
      } else if (type === 'symbol') {
        if (layer.layout?.['text-field']) {
          layer.paint['text-color'] = id.includes('water')
            ? '#7dd3fc'
            : id.includes('poi')
            ? '#cbd5e1'
            : '#f8fafc';
          layer.paint['text-halo-color'] = '#060a12';
          layer.paint['text-halo-width'] = 2;
        }
      }
    }

    cachedDark3DStyle = spec;
    return spec;
  } catch {
    return LIBERTY_STYLE_URL;
  }
}

async function resolveStyleForTheme(theme: MapTheme): Promise<string | StyleSpecification> {
  if (theme === 'vector3d') {
    return LIBERTY_STYLE_URL;
  }
  if (theme === 'dark3d') {
    return await buildAutomotiveDark3DStyle();
  }
  if (theme === 'satellite') {
    return {
      version: 8,
      sources: {
        sat: {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
        },
      },
      layers: [
        {
          id: 'sat-layer',
          type: 'raster',
          source: 'sat',
          paint: { 'raster-contrast': 0.08 },
        },
      ],
    };
  }

  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'osm-layer',
        type: 'raster',
        source: 'osm',
      },
    ],
  };
}

const THEME_LABELS: Record<MapTheme, string> = {
  vector3d: '3D Sáng',
  dark3d: '3D Đêm',
  osm: 'OSM Chuẩn',
  satellite: 'Vệ tinh',
};

interface PlaceItem {
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
  distanceKm: number;
}

interface TurnStep {
  lat: number;
  lon: number;
  distanceM: number;
  instruction: string;
  arrow: string;
}

interface ActiveRoute {
  destinationName: string;
  destLat: number;
  destLon: number;
  distanceKm: number;
  durationMin: number;
  geometry: any;
  steps: TurnStep[];
}

export interface CarCockpitMapProps {
  telemetry: CockpitTelemetry;
  clockTime: string;
  isMapExpanded: boolean;
  onToggleExpandMap: () => void;
  mapSide: 'left' | 'right';
  onToggleMapSide: () => void;
  mapWidthPct: number;
  onChangeMapWidthPct: (pct: number) => void;
  suppressResizeObserver?: boolean;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const CarCockpitMap: React.FC<CarCockpitMapProps> = ({
  telemetry,
  clockTime,
  isMapExpanded,
  onToggleExpandMap,
  mapSide,
  onToggleMapSide,
  mapWidthPct,
  onChangeMapWidthPct,
  suppressResizeObserver = false,
}) => {
  const {
    speedKmh,
    gpsStatus,
    position,
    weather,
    roadInfo,
    speedAlertSound,
    onToggleSpeedAlertSound,
    requestGps,
  } = telemetry;

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const carMarkerRef = useRef<MapLibreMarker | null>(null);
  const carArrowElRef = useRef<HTMLDivElement | null>(null);
  const destMarkerRef = useRef<MapLibreMarker | null>(null);
  const hazardMarkersRef = useRef<MapLibreMarker[]>([]);
  const sovereigntyMarkersRef = useRef<MapLibreMarker[]>([]);
  const suppressResizeRef = useRef<boolean>(suppressResizeObserver);
  suppressResizeRef.current = suppressResizeObserver;

  const [mapTheme, setMapTheme] = useState<MapTheme>(() => {
    const hr = new Date().getHours();
    return hr >= 18 || hr < 6 ? 'dark3d' : 'vector3d';
  });
  const appliedThemeRef = useRef<MapTheme>(mapTheme);

  const [is3DHeadingUp, setIs3DHeadingUp] = useState<boolean>(true);
  const [isFollowing, setIsFollowing] = useState<boolean>(true);
  const [isRouteOverview, setIsRouteOverview] = useState<boolean>(false);
  const [webglError, setWebglError] = useState<boolean>(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState<boolean>(false);

  // Quick Navigation / EV Charging search state
  const [navDrawerOpen, setNavDrawerOpen] = useState<boolean>(false);
  const [placeQuery, setPlaceQuery] = useState<string>('');
  const [placeResults, setPlaceResults] = useState<PlaceItem[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState<boolean>(false);
  const [activeRoute, setActiveRoute] = useState<ActiveRoute | null>(null);
  const [isRouting, setIsRouting] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const activeRouteRef = useRef<ActiveRoute | null>(activeRoute);
  activeRouteRef.current = activeRoute;

  // Đồng bộ vệt dẫn đường lên MapLibre đảm bảo 100% hiển thị cả sau khi đổi style Sáng/Đêm
  const syncRouteDataToMap = useCallback((map: MapLibreMap) => {
    const apply = () => {
      try {
        const route = activeRouteRef.current;
        const geojsonData: any = route?.geometry
          ? { type: 'Feature', properties: {}, geometry: route.geometry }
          : { type: 'FeatureCollection', features: [] };

        const existing = map.getSource('carhub-route') as GeoJSONSource | undefined;
        if (existing) {
          existing.setData(geojsonData);
        } else {
          map.addSource('carhub-route', {
            type: 'geojson',
            data: geojsonData,
          });

          map.addLayer({
            id: 'carhub-route-casing',
            type: 'line',
            source: 'carhub-route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#0369a1',
              'line-width': 12,
              'line-opacity': 0.75,
            },
          });

          map.addLayer({
            id: 'carhub-route-line',
            type: 'line',
            source: 'carhub-route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#22d3ee',
              'line-width': 6.5,
              'line-opacity': 1,
            },
          });
        }
      } catch {}
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once('idle', apply);
    }
  }, []);

  // Khởi tạo bản đồ WebGL 3D MapLibre
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    let cancelled = false;
    let resizeObs: ResizeObserver | null = null;
    let lastResizeTs = 0;
    let trailingResizeTimer: number | null = null;

    (async () => {
      const initialStyle = await resolveStyleForTheme(appliedThemeRef.current);
      if (cancelled || !mapContainerRef.current) return;

      let map: MapLibreMap;
      try {
        map = new MapLibreMap({
          container: mapContainerRef.current,
          style: initialStyle,
          center: [position.lon, position.lat],
          zoom: 16.0,
          pitch: 52,
          bearing: position.heading || 0,
          attributionControl: false,
        });
      } catch (err) {
        console.error('MapLibre WebGL init failed:', err);
        setWebglError(true);
        return;
      }

      map.on('load', () => {
        map.resize();
        syncRouteDataToMap(map);
      });

      map.on('style.load', () => {
        syncRouteDataToMap(map);
      });

      map.on('dragstart', () => {
        setIsFollowing(false);
        setIsRouteOverview(false);
      });

      const islands = [
        { label: '🇻🇳 Quần đảo Hoàng Sa (Việt Nam)', lon: 112.0, lat: 16.5 },
        { label: '🇻🇳 Quần đảo Trường Sa (Việt Nam)', lon: 114.2, lat: 10.0 },
      ];
      sovereigntyMarkersRef.current = islands.map((isl) => {
        const el = document.createElement('div');
        el.style.padding = '2px 8px';
        el.style.borderRadius = '9999px';
        el.style.background = 'rgba(2,6,23,0.85)';
        el.style.color = '#38bdf8';
        el.style.fontWeight = '800';
        el.style.fontSize = '11px';
        el.style.border = '1px solid rgba(56,189,248,0.45)';
        el.style.whiteSpace = 'nowrap';
        el.style.pointerEvents = 'none';
        el.textContent = isl.label;
        return new MapLibreMarker({ element: el, anchor: 'center' })
          .setLngLat([isl.lon, isl.lat])
          .addTo(map);
      });

      const puckWrap = document.createElement('div');
      puckWrap.style.width = '46px';
      puckWrap.style.height = '46px';
      puckWrap.style.display = 'flex';
      puckWrap.style.alignItems = 'center';
      puckWrap.style.justifyContent = 'center';
      puckWrap.style.pointerEvents = 'none';

      puckWrap.innerHTML = `
        <div style="position:relative;width:42px;height:42px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;inset:0;border-radius:9999px;background:rgba(37,99,235,0.34);box-shadow:0 0 22px rgba(37,99,235,0.8);"></div>
          <div data-arrow="1" style="position:relative;width:32px;height:32px;border-radius:9999px;background:#2563eb;border:3px solid #ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;transition:transform 250ms ease;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#ffffff">
              <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
            </svg>
          </div>
        </div>
      `;

      carArrowElRef.current = puckWrap.querySelector('[data-arrow="1"]') as HTMLDivElement | null;

      const marker = new MapLibreMarker({ element: puckWrap, anchor: 'center' })
        .setLngLat([position.lon, position.lat])
        .addTo(map);

      carMarkerRef.current = marker;
      mapRef.current = map;

      window.requestAnimationFrame(() => map.resize());
      window.setTimeout(() => map.resize(), 250);

      // Throttle resize + trailing sync để kéo thanh ngăn / thanh trượt Bố cục mượt 60fps không giật WebGL!
      resizeObs = new ResizeObserver(() => {
        const now = performance.now();
        if (trailingResizeTimer !== null) {
          window.clearTimeout(trailingResizeTimer);
        }
        const minGap = suppressResizeRef.current ? 85 : 50;
        if (now - lastResizeTs >= minGap) {
          lastResizeTs = now;
          map.resize();
        } else {
          trailingResizeTimer = window.setTimeout(() => {
            lastResizeTs = performance.now();
            trailingResizeTimer = null;
            map.resize();
          }, minGap);
        }
      });
      resizeObs.observe(container);
    })();

    return () => {
      cancelled = true;
      if (trailingResizeTimer !== null) {
        window.clearTimeout(trailingResizeTimer);
      }
      resizeObs?.disconnect();
      for (const sm of sovereigntyMarkersRef.current) sm.remove();
      sovereigntyMarkersRef.current = [];
      carMarkerRef.current?.remove();
      carMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Khi kết thúc kéo thả thanh ngăn -> gọi resize 1 lần chuẩn xác cuối cùng
  useEffect(() => {
    if (!suppressResizeObserver && mapRef.current) {
      window.requestAnimationFrame(() => {
        mapRef.current?.resize();
      });
    }
  }, [suppressResizeObserver, mapWidthPct, mapSide, isMapExpanded]);

  // Đổi lớp bản đồ (Sáng 3D / Đêm 3D / OSM / Vệ tinh)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedThemeRef.current === mapTheme) return;
    appliedThemeRef.current = mapTheme;

    let cancelled = false;
    resolveStyleForTheme(mapTheme).then((style) => {
      if (cancelled || !mapRef.current) return;
      mapRef.current.setStyle(style);
      mapRef.current.once('idle', () => {
        if (mapRef.current) syncRouteDataToMap(mapRef.current);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [mapTheme, syncRouteDataToMap]);

  // Nếu xe bắt đầu lăn bánh (> 5 km/h) khi đang xem toàn cảnh lộ trình -> tự động chuyển sang Bám mũi xe 3D!
  useEffect(() => {
    if (isRouteOverview && speedKmh !== null && speedKmh >= 5) {
      setIsRouteOverview(false);
      setIsFollowing(true);
    }
  }, [isRouteOverview, speedKmh]);

  // Cập nhật vị trí xe VF5 & góc xoay Camera 3D
  useEffect(() => {
    const map = mapRef.current;
    const marker = carMarkerRef.current;
    if (!map || !marker) return;

    marker.setLngLat([position.lon, position.lat]);

    const currentHeading = position.heading ?? 0;
    if (carArrowElRef.current) {
      const arrowDeg = is3DHeadingUp && isFollowing && !isRouteOverview ? 0 : currentHeading;
      carArrowElRef.current.style.transform = `rotate(${arrowDeg}deg)`;
    }

    if (isFollowing && !isRouteOverview) {
      map.easeTo({
        center: [position.lon, position.lat],
        zoom: is3DHeadingUp ? 16.2 : 15.5,
        pitch: is3DHeadingUp ? 52 : 0,
        bearing: is3DHeadingUp ? currentHeading : 0,
        padding: is3DHeadingUp
          ? { top: 70, bottom: 15, left: 0, right: 0 }
          : { top: 20, bottom: 20, left: 0, right: 0 },
        duration: 600,
      });
    }
  }, [position.lat, position.lon, position.heading, isFollowing, is3DHeadingUp, isRouteOverview]);

  // Cập nhật vệt đường & cờ đích khi có lộ trình mới
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    syncRouteDataToMap(map);

    if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }

    if (activeRoute) {
      const flagEl = document.createElement('div');
      flagEl.style.padding = '4px 8px';
      flagEl.style.borderRadius = '9999px';
      flagEl.style.background = '#e11d48';
      flagEl.style.color = '#ffffff';
      flagEl.style.fontWeight = '900';
      flagEl.style.fontSize = '11px';
      flagEl.style.border = '2px solid #ffffff';
      flagEl.style.boxShadow = '0 4px 12px rgba(0,0,0,0.6)';
      flagEl.textContent = '🏁 ĐÍCH';

      destMarkerRef.current = new MapLibreMarker({ element: flagEl, anchor: 'bottom' })
        .setLngLat([activeRoute.destLon, activeRoute.destLat])
        .addTo(map);

      // Phóng bao quát toàn bộ lộ trình từ xe tới Đích để tài xế nhìn thấy ngay vệt đường xanh!
      const coords: [number, number][] = activeRoute.geometry?.coordinates || [];
      if (coords.length >= 2) {
        const bounds = new LngLatBounds(coords[0], coords[0]);
        for (const c of coords) {
          bounds.extend([c[0], c[1]]);
        }
        bounds.extend([position.lon, position.lat]);
        setIsRouteOverview(true);
        map.fitBounds(bounds, {
          padding: { top: 68, bottom: 58, left: 40, right: 40 },
          pitch: 30,
          bearing: 0,
          duration: 850,
        });
      }
    } else {
      setIsRouteOverview(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoute, syncRouteDataToMap]);

  // Ghim biểu tượng Camera / Cảnh báo hạ tầng lên mặt bản đồ
  useEffect(() => {
    const map = mapRef.current;
    for (const m of hazardMarkersRef.current) {
      m.remove();
    }
    hazardMarkersRef.current = [];

    if (!map || !roadInfo?.hazards) return;

    for (const hz of roadInfo.hazards) {
      if (typeof hz.lat !== 'number' || typeof hz.lon !== 'number') continue;
      const el = document.createElement('div');
      el.style.padding = '3px 7px';
      el.style.borderRadius = '9999px';
      el.style.background = hz.type === 'camera' ? '#be123c' : '#d97706';
      el.style.color = '#ffffff';
      el.style.fontWeight = '800';
      el.style.fontSize = '11px';
      el.style.border = '2px solid #ffffff';
      el.style.boxShadow = '0 3px 10px rgba(0,0,0,0.6)';
      el.textContent =
        hz.type === 'camera'
          ? '🎥 CAM'
          : hz.type === 'signals'
          ? '🚦'
          : hz.type === 'toll'
          ? '🛂 TRẠM'
          : hz.type === 'railway'
          ? '🚂 TÀU'
          : '🏫';

      const m = new MapLibreMarker({ element: el, anchor: 'bottom' })
        .setLngLat([hz.lon, hz.lat])
        .addTo(map);
      hazardMarkersRef.current.push(m);
    }
  }, [roadInfo?.hazards]);

  const cycleMapTheme = () => {
    setMapTheme((prev) => {
      if (prev === 'vector3d') return 'dark3d';
      if (prev === 'dark3d') return 'osm';
      if (prev === 'osm') return 'satellite';
      return 'vector3d';
    });
  };

  const runPlaceSearch = useCallback(
    async (queryText: string, mode = '') => {
      setIsSearchingPlaces(true);
      setRouteError(null);
      try {
        const url = `/api/places?lat=${position.lat.toFixed(4)}&lon=${position.lon.toFixed(4)}${
          mode ? `&mode=${encodeURIComponent(mode)}` : `&q=${encodeURIComponent(queryText)}`
        }`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6500) });
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.includes('application/json')) {
          const data = await res.json();
          setPlaceResults(Array.isArray(data.items) ? data.items : []);
        } else {
          setPlaceResults([]);
        }
      } catch {
        setPlaceResults([]);
      } finally {
        setIsSearchingPlaces(false);
      }
    },
    [position.lat, position.lon]
  );

  // Tự động tìm địa điểm sau 380ms khi gõ chữ (không bắt bấm Enter trên màn xe)
  useEffect(() => {
    if (!navDrawerOpen) return;
    const trimmed = placeQuery.trim();
    if (trimmed.length < 2) return;
    const id = window.setTimeout(() => {
      runPlaceSearch(trimmed);
    }, 380);
    return () => window.clearTimeout(id);
  }, [placeQuery, navDrawerOpen, runPlaceSearch]);

  // Gọi Edge API /api/route (FOSSGIS OSRM + fallback) kèm bước rẽ tiếng Việt
  const startRouteTo = async (place: PlaceItem) => {
    setIsRouting(true);
    setRouteError(null);
    if (gpsStatus === 'idle') {
      requestGps();
    }

    try {
      const apiUrl = `/api/route?fromLat=${position.lat.toFixed(5)}&fromLon=${position.lon.toFixed(
        5
      )}&toLat=${place.lat.toFixed(5)}&toLon=${place.lon.toFixed(5)}`;

      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(8500) });
      const ct = res.headers.get('content-type') || '';

      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        if (data?.success && data?.geometry) {
          setActiveRoute({
            destinationName: place.name,
            destLat: place.lat,
            destLon: place.lon,
            distanceKm: data.distanceKm,
            durationMin: data.durationMin,
            geometry: data.geometry,
            steps: Array.isArray(data.steps) ? data.steps : [],
          });
          setNavDrawerOpen(false);
          setIsRouting(false);
          return;
        }
        setRouteError(data?.error || 'Không tính được đường đi tới địa điểm này.');
      } else {
        setRouteError('Máy chủ dẫn đường đang bận, vui lòng thử lại sau giây lát.');
      }
    } catch {
      setRouteError('Lỗi kết nối mạng khi tính lộ trình.');
    }
    setIsRouting(false);
  };

  const stepIndexRef = useRef<number>(1);
  useEffect(() => {
    stepIndexRef.current = activeRoute && activeRoute.steps.length > 1 ? 1 : 0;
  }, [activeRoute]);

  // Theo dõi tuần tự từng bước rẽ trên lộ trình (tự động chuyển bước khi xe tiến vào < 35m quanh giao lộ)
  const nextTurn = React.useMemo(() => {
    if (!activeRoute || activeRoute.steps.length === 0) return null;
    const steps = activeRoute.steps;
    let idx = Math.min(stepIndexRef.current, steps.length - 1);

    const scanEnd = Math.min(steps.length - 1, idx + 4);
    for (let j = idx; j < scanEnd; j++) {
      const d = haversineMeters(position.lat, position.lon, steps[j].lat, steps[j].lon);
      if (d <= 45) {
        idx = j + 1;
        stepIndexRef.current = idx;
      }
    }

    const chosen = steps[idx] || steps[steps.length - 1];
    const distM = Math.round(
      haversineMeters(position.lat, position.lon, chosen.lat, chosen.lon)
    );
    return { step: chosen, distM };
  }, [activeRoute, position.lat, position.lon]);

  const speedValue = speedKmh !== null ? speedKmh : 0;
  const activeLimit = roadInfo?.speedLimit ?? null;
  const isOverLimit = activeLimit !== null && speedKmh !== null && speedValue > activeLimit;
  const isDangerOverLimit =
    activeLimit !== null && speedKmh !== null && speedValue >= activeLimit + 5;

  const remainingRouteKm = activeRoute
    ? Math.max(
        0.1,
        Math.round(
          (haversineMeters(position.lat, position.lon, activeRoute.destLat, activeRoute.destLon) /
            1000) *
            1.25 *
            10
        ) / 10
      )
    : null;

  return (
    <div className="cockpit-pane-cq relative w-full h-[320px] xs:h-[360px] car:h-full rounded-2xl sm:rounded-3xl overflow-hidden border border-white/15 shadow-2xl bg-[#0b1220]">
      {/* KHUNG BẢN ĐỒ WEBGL 3D */}
      {webglError ? (
        <iframe
          title="OpenStreetMap Fallback"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${(
            position.lon - 0.01
          ).toFixed(4)}%2C${(position.lat - 0.008).toFixed(4)}%2C${(position.lon + 0.01).toFixed(
            4
          )}%2C${(position.lat + 0.008).toFixed(4)}&layer=mapnik&marker=${position.lat.toFixed(
            5
          )}%2C${position.lon.toFixed(5)}`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 0,
          }}
        />
      ) : (
        <div
          ref={mapContainerRef}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            width: '100%',
            height: '100%',
          }}
        />
      )}

      {/* =====================================================================
          1. CỤM HUD TỐC ĐỘ & BIỂN BÁO P.127 GÓC TRÊN BÊN TRÁI
         ===================================================================== */}
      <div
        onClick={gpsStatus !== 'active' ? requestGps : undefined}
        className={`absolute top-2 left-2 z-20 backdrop-blur-xl rounded-2xl border px-2.5 py-1.5 flex items-center gap-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.75)] transition-colors ${
          isDangerOverLimit
            ? 'bg-rose-950/90 border-rose-500 ring-2 ring-rose-500/50'
            : 'bg-black/80 border-white/25'
        } ${gpsStatus !== 'active' ? 'cursor-pointer' : ''}`}
      >
        <div className="flex flex-col">
          <div className="flex items-baseline gap-1">
            <span
              className={`text-3xl sm:text-4xl short:text-3xl font-black tabular-nums tracking-tighter leading-none ${
                speedKmh === null
                  ? 'text-white'
                  : isDangerOverLimit
                  ? 'text-rose-400'
                  : isOverLimit
                  ? 'text-amber-300'
                  : 'text-emerald-300'
              }`}
            >
              {speedKmh !== null ? speedKmh : '0'}
            </span>
            <span className="text-[10px] font-black text-white/70">KM/H</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                gpsStatus === 'active' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-white/75 cq-hide-sm">
              {gpsStatus === 'active'
                ? isDangerOverLimit
                  ? 'QUÁ TỐC!'
                  : 'GPS'
                : 'Bật GPS'}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSpeedAlertSound();
              }}
              aria-label="Bật hoặc tắt chuông cảnh báo quá tốc độ"
              className={`p-0.5 rounded-full ${
                speedAlertSound ? 'text-emerald-300' : 'text-white/40'
              }`}
            >
              {speedAlertSound ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {activeLimit !== null && (
          <div className="flex flex-col items-center shrink-0">
            <div
              className={`w-11 h-11 sm:w-12 sm:h-12 short:w-10 short:h-10 rounded-full bg-white text-black border-[4px] border-[#e11d48] flex items-center justify-center shadow-lg ${
                isDangerOverLimit ? 'scale-110 ring-2 ring-rose-400 animate-pulse' : ''
              }`}
            >
              <span className="text-sm sm:text-base short:text-sm font-black tracking-tighter leading-none">
                {activeLimit}
              </span>
            </div>
            <span
              className={`text-[8px] font-extrabold uppercase mt-0.5 ${
                roadInfo?.isVerifiedLimit ? 'text-emerald-300' : 'text-amber-200'
              }`}
            >
              {roadInfo?.isVerifiedLimit ? 'OSM' : 'T.Khảo'}
            </span>
          </div>
        )}
      </div>

      {/* =====================================================================
          2. CỤM NÚT ĐIỀU KHIỂN & TÙY BIẾN BỐ CỤC GÓC TRÊN BÊN PHẢI
         ===================================================================== */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            const next = !navDrawerOpen;
            setNavDrawerOpen(next);
            setLayoutMenuOpen(false);
            setRouteError(null);
            if (gpsStatus === 'idle') requestGps();
            if (next && placeResults.length === 0) {
              runPlaceSearch('', 'ev');
            }
          }}
          title="Tìm đường & Trạm sạc VinFast"
          className={`min-h-[36px] short:min-h-[32px] px-2.5 rounded-xl backdrop-blur-xl border text-xs font-extrabold flex items-center gap-1.5 shadow-lg active:scale-95 transition ${
            navDrawerOpen
              ? 'bg-white text-black border-white'
              : 'bg-black/80 hover:bg-black/95 text-sky-200 border-white/25'
          }`}
        >
          <Navigation className="w-3.5 h-3.5 shrink-0" />
          <span className="cq-hide-md">Dẫn đường</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIs3DHeadingUp((v) => !v);
            setIsRouteOverview(false);
            setIsFollowing(true);
          }}
          title="Đổi góc nhìn 3D Mũi xe / 2D Hướng Bắc"
          className="min-h-[36px] short:min-h-[32px] px-2 rounded-xl bg-black/80 hover:bg-black/95 backdrop-blur-xl border border-white/25 text-white text-xs font-black flex items-center gap-1 shadow-lg active:scale-95 transition"
        >
          <Compass className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
          <span>{is3DHeadingUp ? '3D' : '2D'}</span>
        </button>

        <button
          type="button"
          onClick={cycleMapTheme}
          title="Đổi lớp bản đồ: 3D Sáng / 3D Đêm / OSM / Vệ tinh"
          className="min-h-[36px] short:min-h-[32px] px-2 rounded-xl bg-black/80 hover:bg-black/95 backdrop-blur-xl border border-white/25 text-white text-xs font-extrabold flex items-center gap-1 shadow-lg active:scale-95 transition"
        >
          <Layers className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span className="cq-hide-md">{THEME_LABELS[mapTheme]}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setLayoutMenuOpen((v) => !v);
            setNavDrawerOpen(false);
          }}
          aria-label="Tùy chỉnh vị trí và kích thước bản đồ"
          title="Đổi vị trí Trái/Phải & Chỉnh độ rộng Bản đồ"
          className={`min-h-[36px] short:min-h-[32px] px-2 rounded-xl backdrop-blur-xl border text-xs font-extrabold flex items-center gap-1 shadow-lg active:scale-95 transition ${
            layoutMenuOpen
              ? 'bg-white text-black border-white'
              : 'bg-black/80 hover:bg-black/95 text-emerald-200 border-white/25'
          }`}
        >
          <Columns2 className="w-3.5 h-3.5 shrink-0" />
          <span className="cq-hide-md">Bố cục</span>
        </button>

        <button
          type="button"
          onClick={onToggleExpandMap}
          aria-label={isMapExpanded ? 'Thu gọn bản đồ về chia đôi' : 'Mở rộng bản đồ toàn màn hình'}
          className="w-9 h-9 short:w-8 short:h-8 rounded-xl bg-black/80 hover:bg-black/95 backdrop-blur-xl border border-white/25 text-white flex items-center justify-center shadow-lg active:scale-95 transition"
        >
          {isMapExpanded ? (
            <Minimize2 className="w-4 h-4 text-sky-300" />
          ) : (
            <Maximize2 className="w-4 h-4 text-sky-300" />
          )}
        </button>
      </div>

      {/* =====================================================================
          2B. BẢNG TÙY BIẾN VỊ TRÍ (TRÁI / PHẢI) & KÍCH THƯỚC BỀ NGANG COCKPIT
         ===================================================================== */}
      {layoutMenuOpen && (
        <div className="absolute right-2 top-13 short:top-11 z-30 w-[275px] max-w-[calc(100%-16px)] bg-black/92 backdrop-blur-2xl border border-white/25 rounded-2xl p-3 space-y-2.5 shadow-2xl animate-ios-sheet-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-white/80">
              Tùy chỉnh bố cục Cockpit
            </span>
            <button
              type="button"
              onClick={() => setLayoutMenuOpen(false)}
              className="w-6 h-6 rounded-full bg-white/10 text-white/75 flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-bold text-white/60">Vị trí hiển thị</span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (mapSide !== 'left') onToggleMapSide();
                }}
                className={`min-h-[38px] px-2 rounded-xl border text-[11px] font-extrabold flex items-center justify-center gap-1 active:scale-95 transition ${
                  mapSide === 'left' && !isMapExpanded
                    ? 'bg-emerald-500 text-black border-emerald-300 shadow'
                    : 'bg-white/10 text-white/80 border-white/15 hover:bg-white/20'
                }`}
              >
                <span>🗺️ Trái • 🎵 Phải</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mapSide !== 'right') onToggleMapSide();
                }}
                className={`min-h-[38px] px-2 rounded-xl border text-[11px] font-extrabold flex items-center justify-center gap-1 active:scale-95 transition ${
                  mapSide === 'right' && !isMapExpanded
                    ? 'bg-emerald-500 text-black border-emerald-300 shadow'
                    : 'bg-white/10 text-white/80 border-white/15 hover:bg-white/20'
                }`}
              >
                <span>🎵 Trái • 🗺️ Phải</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-white/60">Độ rộng Bản đồ</span>
              <span className="text-emerald-300 font-mono font-extrabold">
                {isMapExpanded ? '100% (Toàn màn)' : `Map ${mapWidthPct}% • Nhạc ${100 - mapWidthPct}%`}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1">
              {[40, 50, 58, 68].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    if (isMapExpanded) onToggleExpandMap();
                    onChangeMapWidthPct(pct);
                  }}
                  className={`min-h-[32px] rounded-lg border text-[11px] font-extrabold active:scale-95 transition ${
                    !isMapExpanded && Math.abs(mapWidthPct - pct) <= 2
                      ? 'bg-white text-black border-white'
                      : 'bg-white/10 text-white/80 border-white/15 hover:bg-white/20'
                  }`}
                >
                  {pct}%
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  if (!isMapExpanded) onToggleExpandMap();
                }}
                className={`min-h-[32px] rounded-lg border text-[11px] font-extrabold active:scale-95 transition ${
                  isMapExpanded
                    ? 'bg-sky-400 text-black border-sky-300'
                    : 'bg-white/10 text-white/80 border-white/15 hover:bg-white/20'
                }`}
              >
                Full
              </button>
            </div>

            {!isMapExpanded && (
              <input
                type="range"
                aria-label="Thanh chỉnh tỉ lệ bề ngang bản đồ"
                min={34}
                max={70}
                step={1}
                value={mapWidthPct}
                style={
                  {
                    '--progress': `${((mapWidthPct - 34) / (70 - 34)) * 100}%`,
                  } as React.CSSProperties
                }
                onChange={(e) => onChangeMapWidthPct(parseInt(e.target.value, 10))}
                className="car-scrubber"
              />
            )}

            <p className="text-[10px] text-white/45 flex items-center gap-1">
              <ArrowLeftRight className="w-3 h-3 shrink-0" />
              <span>Kéo nút cầm ở giữa 2 khung để chỉnh mượt!</span>
            </p>
          </div>
        </div>
      )}

      {/* =====================================================================
          3. THẺ HƯỚNG DẪN RẼ TIẾP THEO & LỘ TRÌNH ĐANG CHẠY
         ===================================================================== */}
      {activeRoute && !navDrawerOpen && !layoutMenuOpen && (
        <div className="absolute top-13 short:top-11 right-2 z-20 max-w-[265px] bg-sky-950/95 backdrop-blur-xl border border-sky-400/60 rounded-2xl p-2.5 flex flex-col gap-1.5 shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {nextTurn && (
                <p className="text-xs font-black text-white leading-snug line-clamp-2">
                  {nextTurn.step.arrow} {nextTurn.step.instruction}
                  {nextTurn.distM > 0 ? ` (${nextTurn.distM}m)` : ''}
                </p>
              )}
              <div className="flex items-center gap-1 text-[11px] font-bold text-sky-300 truncate mt-0.5">
                <Flag className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {activeRoute.destinationName} • ~{remainingRouteKm ?? activeRoute.distanceKm} km (
                  {activeRoute.durationMin}p)
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveRoute(null)}
              aria-label="Hủy lộ trình"
              className="w-7 h-7 rounded-full bg-white/15 hover:bg-rose-500 text-white flex items-center justify-center shrink-0 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {isRouteOverview && (
            <button
              type="button"
              onClick={() => {
                setIsRouteOverview(false);
                setIsFollowing(true);
              }}
              className="w-full min-h-[32px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black flex items-center justify-center gap-1.5 shadow active:scale-95 transition"
            >
              <Play className="w-3.5 h-3.5 fill-black" />
              <span>Bắt đầu đi (Bám mũi xe 3D)</span>
            </button>
          )}
        </div>
      )}

      {/* =====================================================================
          4. HỘP TÌM ĐỊA ĐIỂM & TRẠM SẠC VINFAST NHANH
         ===================================================================== */}
      {navDrawerOpen && (
        <div className="absolute inset-x-2 top-13 short:top-11 bottom-12 z-30 bg-black/94 backdrop-blur-2xl border border-white/25 rounded-2xl p-2.5 flex flex-col gap-2 shadow-2xl animate-ios-sheet-in">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (placeQuery.trim()) runPlaceSearch(placeQuery.trim());
            }}
            className="flex items-center gap-1.5 shrink-0"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-white/50 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                placeholder="Gõ tên đường, trung tâm thương mại, điểm đến..."
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-white/12 border border-white/20 text-xs sm:text-sm font-bold text-white placeholder-white/45 focus:outline-none focus:border-sky-400"
              />
            </div>
            <button
              type="submit"
              className="h-9 px-3 rounded-xl bg-sky-500 text-black font-extrabold text-xs shrink-0 active:scale-95"
            >
              Tìm
            </button>
            <button
              type="button"
              onClick={() => setNavDrawerOpen(false)}
              className="h-9 w-9 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </form>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            <button
              type="button"
              onClick={() => runPlaceSearch('', 'ev')}
              className="min-h-[30px] px-2.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/45 text-[11px] font-extrabold text-emerald-200 whitespace-nowrap flex items-center gap-1 active:scale-95"
            >
              <Zap className="w-3 h-3 fill-current" />
              <span>Trạm sạc VinFast gần đây</span>
            </button>
            <button
              type="button"
              onClick={() => runPlaceSearch('Bãi đỗ xe')}
              className="min-h-[30px] px-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-bold text-white/85 whitespace-nowrap active:scale-95"
            >
              🅿️ Bãi đỗ xe
            </button>
            <button
              type="button"
              onClick={() => runPlaceSearch('Cà phê')}
              className="min-h-[30px] px-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-bold text-white/85 whitespace-nowrap active:scale-95"
            >
              ☕ Cà phê
            </button>
          </div>

          {routeError && (
            <div className="px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-400/50 text-xs font-bold text-rose-200 shrink-0">
              {routeError}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-1">
            {isSearchingPlaces || isRouting ? (
              <div className="h-full flex items-center justify-center gap-2 text-xs font-bold text-white/75">
                <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                <span>{isRouting ? 'Đang tính lộ trình tối ưu...' : 'Đang tìm địa điểm...'}</span>
              </div>
            ) : placeResults.length === 0 ? (
              <p className="text-center text-xs text-white/50 py-4">
                Không tìm thấy địa điểm — Hãy thử gõ tên quận/đường rõ hơn
              </p>
            ) : (
              placeResults.map((pl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => startRouteTo(pl)}
                  className="w-full text-left px-3 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.18] border border-white/12 flex items-center justify-between gap-2 active:scale-99 transition"
                >
                  <div className="min-w-0">
                    <h5 className="text-xs font-extrabold text-white truncate">{pl.name}</h5>
                    {pl.subtitle && (
                      <p className="text-[10px] text-white/55 truncate">{pl.subtitle}</p>
                    )}
                  </div>
                  <span className="px-2 py-0.5 rounded-lg bg-sky-500/20 text-[11px] font-mono font-extrabold text-sky-300 shrink-0">
                    Đi • {pl.distanceKm} km
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          5. CỤM HẠ TẦNG ĐƯỜNG BỘ, CAMERA & THỜI TIẾT NỔI Ở ĐÁY BẢN ĐỒ
         ===================================================================== */}
      <div className="absolute inset-x-2 bottom-2 z-20 flex flex-col gap-1.5 pointer-events-none">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {roadInfo?.hazards?.map((hz, i) => (
              <span
                key={i}
                className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1 border backdrop-blur-xl shadow-lg ${
                  hz.type === 'camera'
                    ? 'bg-rose-600/95 border-rose-300 text-white animate-pulse'
                    : 'bg-amber-600/95 border-amber-300 text-white'
                }`}
              >
                {hz.type === 'camera' ? (
                  <CameraIcon className="w-3 h-3 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                )}
                <span>{hz.label}</span>
              </span>
            ))}
          </div>

          {(!isFollowing || isRouteOverview) && (
            <button
              type="button"
              onClick={() => {
                setIsRouteOverview(false);
                setIsFollowing(true);
              }}
              className="pointer-events-auto min-h-[34px] px-3 rounded-full bg-emerald-500 text-black text-xs font-black flex items-center gap-1.5 shadow-xl active:scale-95 transition"
            >
              <LocateFixed className="w-3.5 h-3.5" />
              <span>Bám mũi xe</span>
            </button>
          )}
        </div>

        <div className="bg-black/85 backdrop-blur-xl border border-white/20 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2 shadow-xl">
          <div className="flex items-center gap-1.5 min-w-0">
            {roadInfo?.roadRef && (
              <span className="px-1.5 py-0.2 rounded bg-sky-500/25 border border-sky-400/40 text-[10px] font-black text-sky-200 shrink-0">
                {roadInfo.roadRef}
              </span>
            )}
            <span className="text-xs font-extrabold text-white truncate">
              {roadInfo?.roadName ||
                (gpsStatus === 'active'
                  ? 'Đang dò tên đường...'
                  : 'Bản đồ 3D VinFast VF5 (Chạm ô KM/H để bật GPS)')}
            </span>
            {roadInfo?.lanes && (
              <span className="text-[10px] font-bold text-white/55 shrink-0 cq-hide-sm">
                • {roadInfo.lanes} làn
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] font-bold text-white/85 shrink-0">
            {weather && (
              <span className={weather.isRainy ? 'text-sky-300' : 'text-white/85'}>
                {weather.icon} {weather.temperature}°C
              </span>
            )}
            <span className="font-mono font-black text-white">{clockTime}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CarCockpitMap;
