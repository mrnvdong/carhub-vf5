import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  GeoJSONSource,
  RasterTileSource,
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
  Volume2,
  VolumeX,
  Send,
  Star,
  Home,
  Briefcase,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { CockpitTelemetry } from '../hooks/useCockpitTelemetry';
import { ActiveNavSummary, CockpitNavControls, MapTheme, PendingNavTarget, SavedPlace } from '../types';
import { sendNavToCar } from '../services/sync';
import { playTurnChime, speakVietnamese, unlockCarAudio } from '../services/voiceAudio';

setWorkerUrl(maplibreWorkerUrl);

const LIBERTY_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
let cachedLibertyBaseJson: any = null;
let cachedLight3DTemplate: StyleSpecification | null = null;
let cachedDark3DTemplate: StyleSpecification | null = null;

async function ensureLibertyBaseJson(): Promise<any> {
  if (cachedLibertyBaseJson) return cachedLibertyBaseJson;
  const res = await fetch(LIBERTY_STYLE_URL);
  if (!res.ok) throw new Error('Failed to load Liberty base style');
  cachedLibertyBaseJson = await res.json();
  return cachedLibertyBaseJson;
}

// Chế độ "3D Sáng" chuẩn màn ô tô: Chữ đen đậm (#0f172a) + viền trắng dày sắc nét, font đường in đậm dễ đọc ngoài nắng
async function buildAutomotiveLight3DStyle(): Promise<StyleSpecification | string> {
  try {
    if (!cachedLight3DTemplate) {
      const base = await ensureLibertyBaseJson();
      const spec = JSON.parse(JSON.stringify(base));

      for (const layer of spec.layers || []) {
        const id = String(layer.id || '');
        const type = String(layer.type || '');
        if (type !== 'symbol') continue;

        layer.paint = layer.paint || {};
        layer.layout = layer.layout || {};

        if (layer.layout['text-field'] && !id.includes('shield')) {
          if (id.includes('highway-name')) {
            layer.layout['text-font'] = ['Noto Sans Bold'];
          }
          layer.paint['text-color'] = id.includes('water')
            ? '#1d4ed8'
            : id.includes('poi')
            ? '#1e293b'
            : '#0f172a';
          layer.paint['text-halo-color'] = '#ffffff';
          layer.paint['text-halo-width'] = 2.2;
          layer.paint['text-halo-blur'] = 0.2;
        }
      }
      cachedLight3DTemplate = spec;
    }
    return JSON.parse(JSON.stringify(cachedLight3DTemplate));
  } catch {
    return LIBERTY_STYLE_URL;
  }
}

// Chế độ "3D Đêm" chuẩn màn ô tô: Nền đêm sâu #0b1220, nhà 3D nổi #1e304f, chữ trắng tinh #ffffff viền tối dày sắc nét
async function buildAutomotiveDark3DStyle(): Promise<StyleSpecification | string> {
  try {
    if (!cachedDark3DTemplate) {
      const base = await ensureLibertyBaseJson();
      const spec = JSON.parse(JSON.stringify(base));

      for (const layer of spec.layers || []) {
        const id = String(layer.id || '');
        const type = String(layer.type || '');
        layer.paint = layer.paint || {};
        layer.layout = layer.layout || {};

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
          if (layer.layout['text-field'] && !id.includes('shield')) {
            if (id.includes('highway-name')) {
              layer.layout['text-font'] = ['Noto Sans Bold'];
            }
            layer.paint['text-color'] = id.includes('water')
              ? '#7dd3fc'
              : id.includes('poi')
              ? '#e2e8f0'
              : '#ffffff';
            layer.paint['text-halo-color'] = '#020617';
            layer.paint['text-halo-width'] = 2.4;
            layer.paint['text-halo-blur'] = 0.2;
          }
        }
      }
      cachedDark3DTemplate = spec;
    }
    return JSON.parse(JSON.stringify(cachedDark3DTemplate));
  } catch {
    return LIBERTY_STYLE_URL;
  }
}

async function resolveStyleForTheme(theme: MapTheme): Promise<string | StyleSpecification> {
  if (theme === 'vector3d') {
    return await buildAutomotiveLight3DStyle();
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

const TRAFFIC_SOURCE_ID = 'carhub-traffic';
const TRAFFIC_LAYER_ID = 'carhub-traffic-layer';

function buildTrafficTileUrls(tick: number): string[] {
  // Lớp tile giao thông trong suốt (Retina 2x, chỉ giữ vệt màu xanh/vàng/đỏ, ẩn hoàn toàn đường/chữ nền trùng lặp)
  const query = `lyrs=h,traffic&apistyle=s.e:g%7Cp.v:off,s.e:l%7Cp.v:off&scale=2&x={x}&y={y}&z={z}&_t=${tick}`;
  return [
    `https://mt0.google.com/vt?${query}`,
    `https://mt1.google.com/vt?${query}`,
    `https://mt2.google.com/vt?${query}`,
    `https://mt3.google.com/vt?${query}`,
  ];
}

function findTrafficBeforeLayerId(map: MapLibreMap): string | undefined {
  // Đặt lớp giao thông ngay dưới tòa nhà 3D để nhà 3D, tên đường và vệt dẫn đường luôn sắc nét bên trên
  if (map.getLayer('building-3d')) return 'building-3d';
  if (map.getLayer('highway-name-path')) return 'highway-name-path';
  const layers = map.getStyle()?.layers || [];
  const firstSymbol = layers.find((l) => l.type === 'symbol');
  if (firstSymbol?.id) return firstSymbol.id;
  if (map.getLayer('carhub-route-casing')) return 'carhub-route-casing';
  return undefined;
}

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
  isVisible?: boolean;
  isMapExpanded: boolean;
  onToggleExpandMap: () => void;
  mapSide: 'left' | 'right';
  onToggleMapSide: () => void;
  mapWidthPct: number;
  onChangeMapWidthPct: (pct: number) => void;
  mapTheme: MapTheme;
  onChangeMapTheme: (theme: MapTheme) => void;
  suppressResizeObserver?: boolean;
  savedPlaces: SavedPlace[];
  onSavePlace: (place: SavedPlace) => void;
  onRemoveSavedPlace: (id: string) => void;
  syncCode: string;
  incomingNavTarget: PendingNavTarget | null;
  onConsumeIncomingNav: () => void;
  onActiveNavChange?: (summary: ActiveNavSummary | null) => void;
  navControlsRef?: React.MutableRefObject<CockpitNavControls | null>;
  onNotifyToast?: (msg: string) => void;
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

// Tính khoảng cách thực tế còn lại dọc theo polyline tuyến đường + khoảng cách lệch khỏi tuyến (cross-track)
function computeRouteProgress(
  lat: number,
  lon: number,
  coords: [number, number][],
  totalKm: number,
  totalMin: number
): { remainingKm: number; remainingMin: number; crossTrackDistM: number } {
  if (!Array.isArray(coords) || coords.length < 2) {
    return { remainingKm: totalKm, remainingMin: totalMin, crossTrackDistM: 0 };
  }

  let closestIdx = 0;
  let minDistM = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineMeters(lat, lon, coords[i][1], coords[i][0]);
    if (d < minDistM) {
      minDistM = d;
      closestIdx = i;
    }
  }

  let remainingM = 0;
  for (let i = closestIdx; i < coords.length - 1; i++) {
    remainingM += haversineMeters(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
  }

  const remainingKm = Math.max(0.1, Math.round((remainingM / 1000) * 10) / 10);
  const ratio = totalKm > 0 ? Math.min(1, remainingKm / totalKm) : 1;
  const remainingMin = Math.max(1, Math.round(totalMin * ratio));

  return {
    remainingKm,
    remainingMin,
    crossTrackDistM: Math.round(minDistM),
  };
}

const CarCockpitMapInner: React.FC<CarCockpitMapProps> = ({
  telemetry,
  clockTime,
  isVisible = true,
  isMapExpanded,
  onToggleExpandMap,
  mapSide,
  onToggleMapSide,
  mapWidthPct,
  onChangeMapWidthPct,
  mapTheme,
  onChangeMapTheme,
  suppressResizeObserver = false,
  savedPlaces,
  onSavePlace,
  onRemoveSavedPlace,
  syncCode,
  incomingNavTarget,
  onConsumeIncomingNav,
  onActiveNavChange,
  navControlsRef,
  onNotifyToast,
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

  // Lớp bản đồ & giao diện toàn hệ thống được đồng bộ từ App.tsx
  const appliedThemeRef = useRef<MapTheme>(mapTheme);

  const [voiceNavEnabled, setVoiceNavEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('carhub_voice_nav');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  // Lớp tình trạng giao thông trực tiếp (xanh/vàng/đỏ), mặc định BẬT và tự cập nhật mỗi 2 phút
  const [showTraffic, setShowTraffic] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('carhub_cockpit_traffic');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [trafficTick, setTrafficTick] = useState<number>(0);
  const [trafficUpdatedAt, setTrafficUpdatedAt] = useState<string>(() =>
    new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  );
  const showTrafficRef = useRef<boolean>(showTraffic);
  showTrafficRef.current = showTraffic;
  const trafficTickRef = useRef<number>(trafficTick);
  trafficTickRef.current = trafficTick;
  const appliedTrafficTickRef = useRef<number>(-1);

  const [is3DHeadingUp, setIs3DHeadingUp] = useState<boolean>(true);
  const [isFollowing, setIsFollowing] = useState<boolean>(true);
  const [isRouteOverview, setIsRouteOverview] = useState<boolean>(false);
  const [webglError, setWebglError] = useState<boolean>(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState<boolean>(false);

  // Quick Navigation / EV Charging search state
  const [navDrawerOpen, setNavDrawerOpen] = useState<boolean>(false);
  const [placeQuery, setPlaceQuery] = useState<string>('');
  const [activePlaceMode, setActivePlaceMode] = useState<string>('ev');
  const [placeResults, setPlaceResults] = useState<PlaceItem[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState<boolean>(false);
  const [activeRoute, setActiveRoute] = useState<ActiveRoute | null>(null);
  const [isRouting, setIsRouting] = useState<boolean>(false);
  const [isRerouting, setIsRerouting] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [sendingToCarIdx, setSendingToCarIdx] = useState<number | null>(null);

  const isLightMap = mapTheme === 'vector3d' || mapTheme === 'osm';
  const isLightMapRef = useRef<boolean>(isLightMap);
  isLightMapRef.current = isLightMap;

  const activeRouteRef = useRef<ActiveRoute | null>(activeRoute);
  activeRouteRef.current = activeRoute;

  const lastRerouteAtRef = useRef<number>(0);
  const spokenMarksRef = useRef<Set<string>>(new Set());
  const lastConsumedNavIdRef = useRef<string>('');

  useEffect(() => {
    try {
      localStorage.setItem('carhub_cockpit_map_theme', mapTheme);
    } catch {}
  }, [mapTheme]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_voice_nav', String(voiceNavEnabled));
    } catch {}
  }, [voiceNavEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_cockpit_traffic', String(showTraffic));
    } catch {}
  }, [showTraffic]);

  // Tự động làm mới lớp giao thông mỗi 2 phút khi đang bật & hiển thị bản đồ
  useEffect(() => {
    if (!showTraffic || !isVisible) return;
    const timer = window.setInterval(() => {
      setTrafficTick((t) => t + 1);
      setTrafficUpdatedAt(
        new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      );
    }, 120_000);
    return () => window.clearInterval(timer);
  }, [showTraffic, isVisible]);

  const handleToggleTraffic = useCallback(() => {
    setShowTraffic((prev) => {
      const next = !prev;
      if (next) {
        setTrafficUpdatedAt(
          new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        );
      }
      onNotifyToast?.(
        next
          ? '🚦 Đã bật lớp Giao thông trực tiếp (tự cập nhật 2 phút/lần)'
          : 'Đã tắt lớp Giao thông'
      );
      return next;
    });
  }, [onNotifyToast]);

  const handleRefreshTrafficNow = useCallback(() => {
    setShowTraffic(true);
    setTrafficTick((t) => t + 1);
    setTrafficUpdatedAt(
      new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    );
    onNotifyToast?.('🔄 Đã làm mới tình trạng giao thông trực tiếp');
  }, [onNotifyToast]);

  // Đồng bộ lớp tình trạng giao thông trực tiếp (xanh/vàng/đỏ) lên MapLibre
  const syncTrafficLayerToMap = useCallback((map: MapLibreMap) => {
    const apply = () => {
      try {
        const enabled = showTrafficRef.current;
        const tick = trafficTickRef.current;
        const light = isLightMapRef.current;
        const opacity = light ? 0.88 : 0.96;

        if (!enabled) {
          if (map.getLayer(TRAFFIC_LAYER_ID)) {
            map.removeLayer(TRAFFIC_LAYER_ID);
          }
          if (map.getSource(TRAFFIC_SOURCE_ID)) {
            map.removeSource(TRAFFIC_SOURCE_ID);
          }
          appliedTrafficTickRef.current = -1;
          return;
        }

        const tiles = buildTrafficTileUrls(tick);
        const existingSource = map.getSource(TRAFFIC_SOURCE_ID) as RasterTileSource | undefined;
        const existingLayer = map.getLayer(TRAFFIC_LAYER_ID);

        if (existingSource && existingLayer) {
          map.setPaintProperty(TRAFFIC_LAYER_ID, 'raster-opacity', opacity);
          if (appliedTrafficTickRef.current !== tick) {
            if (typeof existingSource.setTiles === 'function') {
              existingSource.setTiles(tiles);
            } else {
              map.removeLayer(TRAFFIC_LAYER_ID);
              map.removeSource(TRAFFIC_SOURCE_ID);
              map.addSource(TRAFFIC_SOURCE_ID, {
                type: 'raster',
                tiles,
                tileSize: 256,
                minzoom: 5,
                maxzoom: 19,
              });
              map.addLayer(
                {
                  id: TRAFFIC_LAYER_ID,
                  type: 'raster',
                  source: TRAFFIC_SOURCE_ID,
                  paint: {
                    'raster-opacity': opacity,
                    'raster-fade-duration': 200,
                  },
                },
                findTrafficBeforeLayerId(map)
              );
            }
            appliedTrafficTickRef.current = tick;
          }
          return;
        }

        if (existingLayer) map.removeLayer(TRAFFIC_LAYER_ID);
        if (existingSource) map.removeSource(TRAFFIC_SOURCE_ID);

        map.addSource(TRAFFIC_SOURCE_ID, {
          type: 'raster',
          tiles,
          tileSize: 256,
          minzoom: 5,
          maxzoom: 19,
        });

        map.addLayer(
          {
            id: TRAFFIC_LAYER_ID,
            type: 'raster',
            source: TRAFFIC_SOURCE_ID,
            paint: {
              'raster-opacity': opacity,
              'raster-fade-duration': 200,
            },
          },
          findTrafficBeforeLayerId(map)
        );
        appliedTrafficTickRef.current = tick;
      } catch {}
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once('idle', apply);
    }
  }, []);

  // Đồng bộ vệt dẫn đường lên MapLibre (Xanh Hoàng Gia trên nền Sáng & Xanh Neon trên nền Đêm)
  const syncRouteDataToMap = useCallback((map: MapLibreMap) => {
    const apply = () => {
      try {
        const route = activeRouteRef.current;
        const geojsonData: any = route?.geometry
          ? { type: 'Feature', properties: {}, geometry: route.geometry }
          : { type: 'FeatureCollection', features: [] };

        const light = isLightMapRef.current;
        const lineColor = light ? '#2563eb' : '#22d3ee';
        const casingColor = light ? '#1e3a8a' : '#0369a1';

        const existing = map.getSource('carhub-route') as GeoJSONSource | undefined;
        if (existing) {
          existing.setData(geojsonData);
          if (map.getLayer('carhub-route-casing')) {
            map.setPaintProperty('carhub-route-casing', 'line-color', casingColor);
          }
          if (map.getLayer('carhub-route-line')) {
            map.setPaintProperty('carhub-route-line', 'line-color', lineColor);
          }
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
              'line-color': casingColor,
              'line-width': 12,
              'line-opacity': 0.8,
            },
          });

          map.addLayer({
            id: 'carhub-route-line',
            type: 'line',
            source: 'carhub-route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': lineColor,
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

  // Khởi tạo bản đồ WebGL 3D MapLibre (chỉ khởi tạo 1 lần duy nhất nhờ giữ sống Cockpit!)
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
        syncTrafficLayerToMap(map);
      });

      map.on('style.load', () => {
        syncRouteDataToMap(map);
        syncTrafficLayerToMap(map);
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

  // Khi quay lại tab Cockpit hoặc kết thúc kéo thanh ngăn -> gọi resize 1 lần chuẩn xác
  useEffect(() => {
    if (isVisible && !suppressResizeObserver && mapRef.current) {
      window.requestAnimationFrame(() => {
        mapRef.current?.resize();
      });
    }
  }, [isVisible, suppressResizeObserver, mapWidthPct, mapSide, isMapExpanded]);

  // Đổi lớp bản đồ (Sáng 3D / Đêm 3D / OSM / Vệ tinh) — { diff: false } chống lem màu chữ!
  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedThemeRef.current === mapTheme) return;
    appliedThemeRef.current = mapTheme;

    let cancelled = false;
    resolveStyleForTheme(mapTheme).then((style) => {
      if (cancelled || !mapRef.current) return;
      appliedTrafficTickRef.current = -1;
      mapRef.current.setStyle(style, { diff: false });
      mapRef.current.once('idle', () => {
        if (mapRef.current) {
          syncRouteDataToMap(mapRef.current);
          syncTrafficLayerToMap(mapRef.current);
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, [mapTheme, syncRouteDataToMap, syncTrafficLayerToMap]);

  // Đồng bộ bật/tắt & làm mới lớp Giao thông trực tiếp trên bản đồ
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncTrafficLayerToMap(map);
  }, [showTraffic, trafficTick, mapTheme, syncTrafficLayerToMap]);

  // Nếu xe bắt đầu lăn bánh (>= 5 km/h) khi đang xem toàn cảnh lộ trình -> tự chuyển sang Bám mũi xe 3D
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

    if (isVisible && isFollowing && !isRouteOverview) {
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
  }, [position.lat, position.lon, position.heading, isFollowing, is3DHeadingUp, isRouteOverview, isVisible]);

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

      // Chỉ zoom bao quát khi bắt đầu tuyến mới (không zoom ngược ra toàn cảnh khi đang auto-reroute lúc xe đang chạy!)
      const coords: [number, number][] = activeRoute.geometry?.coordinates || [];
      if (coords.length >= 2 && (!speedKmh || speedKmh < 5)) {
        const bounds = new LngLatBounds(coords[0], coords[0]);
        for (const c of coords) {
          bounds.extend([c[0], c[1]]);
        }
        bounds.extend([position.lon, position.lat]);
        setIsRouteOverview(true);
        map.fitBounds(bounds, {
          padding: { top: 78, bottom: 58, left: 40, right: 40 },
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
    const next: MapTheme =
      mapTheme === 'vector3d'
        ? 'dark3d'
        : mapTheme === 'dark3d'
        ? 'osm'
        : mapTheme === 'osm'
        ? 'satellite'
        : 'vector3d';
    onChangeMapTheme(next);
  };

  const runPlaceSearch = useCallback(
    async (queryText: string, mode = '') => {
      setIsSearchingPlaces(true);
      setRouteError(null);
      setActivePlaceMode(mode);
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

  // Tự động tìm địa điểm sau 380ms khi gõ chữ
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
  const startRouteTo = useCallback(
    async (
      place: { name: string; lat: number; lon: number },
      options?: { isReroute?: boolean; fromPhone?: boolean }
    ) => {
      unlockCarAudio();
      const isReroute = Boolean(options?.isReroute);
      if (isReroute) {
        setIsRerouting(true);
      } else {
        setIsRouting(true);
      }
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
            spokenMarksRef.current = new Set();
            lastRerouteAtRef.current = Date.now();
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
            setIsRerouting(false);

            if (voiceNavEnabled) {
              if (options?.fromPhone) {
                speakVietnamese(
                  `Đã nhận điểm đến từ điện thoại, dẫn đường tới ${place.name}, khoảng ${data.distanceKm} ki lô mét`,
                  { dedupeKey: `start-phone-${place.name}`, cooldownMs: 5000, chime: true }
                );
              } else if (isReroute) {
                speakVietnamese('Đã cập nhật lại tuyến đường mới', {
                  dedupeKey: 'reroute-done',
                  cooldownMs: 8000,
                  chime: true,
                });
              } else {
                speakVietnamese(
                  `Bắt đầu dẫn đường tới ${place.name}, khoảng ${data.distanceKm} ki lô mét, dự kiến ${data.durationMin} phút`,
                  { dedupeKey: `start-${place.name}`, cooldownMs: 5000, chime: true }
                );
              }
            } else if (options?.fromPhone) {
              playTurnChime();
            }
            return;
          }
          if (!isReroute) {
            setRouteError(data?.error || 'Không tính được đường đi tới địa điểm này.');
          }
        } else if (!isReroute) {
          setRouteError('Máy chủ dẫn đường đang bận, vui lòng thử lại sau giây lát.');
        }
      } catch {
        if (!isReroute) {
          setRouteError('Lỗi kết nối mạng khi tính lộ trình.');
        }
      }
      setIsRouting(false);
      setIsRerouting(false);
    },
    [gpsStatus, position.lat, position.lon, requestGps, voiceNavEnabled]
  );

  // Send-to-Car: Tự nhận điểm đến từ điện thoại qua Mã Xe VF5-XXXX
  useEffect(() => {
    if (!incomingNavTarget || !incomingNavTarget.id) return;
    if (lastConsumedNavIdRef.current === incomingNavTarget.id) return;
    lastConsumedNavIdRef.current = incomingNavTarget.id;

    onNotifyToast?.(`📲 Đã nhận điểm đến từ điện thoại: ${incomingNavTarget.name}`);
    startRouteTo(
      {
        name: incomingNavTarget.name,
        lat: incomingNavTarget.lat,
        lon: incomingNavTarget.lon,
      },
      { fromPhone: true }
    );
    onConsumeIncomingNav();
  }, [incomingNavTarget, onConsumeIncomingNav, onNotifyToast, startRouteTo]);

  const stepIndexRef = useRef<number>(1);
  useEffect(() => {
    stepIndexRef.current = activeRoute && activeRoute.steps.length > 1 ? 1 : 0;
  }, [activeRoute]);

  // Theo dõi tuần tự từng bước rẽ trên lộ trình
  const nextTurn = useMemo(() => {
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
    const distM = Math.round(haversineMeters(position.lat, position.lon, chosen.lat, chosen.lon));
    return { step: chosen, distM, stepIdx: idx };
  }, [activeRoute, position.lat, position.lon]);

  // Tính quãng đường & thời gian còn lại CHÍNH XÁC dọc theo Polyline thực tế + độ lệch khỏi tuyến
  const routeProgress = useMemo(() => {
    if (!activeRoute) return null;
    const coords: [number, number][] = activeRoute.geometry?.coordinates || [];
    return computeRouteProgress(
      position.lat,
      position.lon,
      coords,
      activeRoute.distanceKm,
      activeRoute.durationMin
    );
  }, [activeRoute, position.lat, position.lon]);

  // Auto-Reroute: Nếu đang chạy GPS mà lệch khỏi tuyến > 75m (đi nhầm ngã rẽ) -> tự tính lại đường mới!
  useEffect(() => {
    if (!activeRoute || !routeProgress || gpsStatus !== 'active' || isRerouting || isRouting) {
      return;
    }
    const now = Date.now();
    if (routeProgress.crossTrackDistM > 75 && now - lastRerouteAtRef.current > 12000) {
      lastRerouteAtRef.current = now;
      onNotifyToast?.('🔄 Đi chệch tuyến — Đang tự dẫn đường lại...');
      startRouteTo(
        {
          name: activeRoute.destinationName,
          lat: activeRoute.destLat,
          lon: activeRoute.destLon,
        },
        { isReroute: true }
      );
    }
  }, [
    activeRoute,
    routeProgress,
    gpsStatus,
    isRerouting,
    isRouting,
    onNotifyToast,
    startRouteTo,
  ]);

  // Giọng nói chỉ đường tiếng Việt tự động ở mốc 180m và 45m trước mỗi ngã rẽ + khi tới đích!
  useEffect(() => {
    if (!activeRoute || !nextTurn || !voiceNavEnabled || gpsStatus !== 'active') return;

    const { step, distM, stepIdx } = nextTurn;
    const isArrive = step.arrow === '🏁';

    if (isArrive && distM <= 35) {
      const mark = `arrive-${activeRoute.destinationName}`;
      if (!spokenMarksRef.current.has(mark)) {
        spokenMarksRef.current.add(mark);
        speakVietnamese(`Bạn đã đến ${activeRoute.destinationName}`, {
          dedupeKey: mark,
          cooldownMs: 30000,
          chime: true,
        });
      }
      return;
    }

    if (distM <= 185 && distM > 55) {
      const mark = `step-${stepIdx}-180`;
      if (!spokenMarksRef.current.has(mark)) {
        spokenMarksRef.current.add(mark);
        const rounded = Math.max(50, Math.round(distM / 10) * 10);
        speakVietnamese(`Còn ${rounded} mét, ${step.instruction}`, {
          dedupeKey: mark,
          cooldownMs: 15000,
          chime: true,
        });
      }
    } else if (distM <= 55) {
      const mark = `step-${stepIdx}-45`;
      if (!spokenMarksRef.current.has(mark)) {
        spokenMarksRef.current.add(mark);
        speakVietnamese(`Chuẩn bị ${step.instruction}`, {
          dedupeKey: mark,
          cooldownMs: 12000,
          chime: true,
        });
      }
    }
  }, [activeRoute, nextTurn, voiceNavEnabled, gpsStatus]);

  // Đồng bộ điều khiển dẫn đường (Hủy / Bắt đầu bám mũi xe / Bật tắt giọng nói) sang cột Cockpit
  useEffect(() => {
    if (!navControlsRef) return;
    navControlsRef.current = {
      cancelRoute: () => setActiveRoute(null),
      startGuidanceFollow: () => {
        setIsRouteOverview(false);
        setIsFollowing(true);
      },
      toggleVoiceNav: () => {
        unlockCarAudio();
        setVoiceNavEnabled((v) => {
          const next = !v;
          onNotifyToast?.(
            next ? '🔊 Đã bật giọng nói chỉ đường tiếng Việt' : '🔇 Đã tắt giọng nói chỉ đường'
          );
          return next;
        });
      },
    };
    return () => {
      if (navControlsRef) navControlsRef.current = null;
    };
  }, [navControlsRef, onNotifyToast]);

  // Đồng bộ tóm tắt lộ trình lên Cockpit (cột Tốc độ-Thời tiết-Giờ) & VideoPlayer Mini Pill
  useEffect(() => {
    if (!onActiveNavChange) return;
    if (!activeRoute) {
      onActiveNavChange(null);
      return;
    }
    onActiveNavChange({
      destinationName: activeRoute.destinationName,
      remainingKm: routeProgress ? routeProgress.remainingKm : activeRoute.distanceKm,
      remainingMin: routeProgress ? routeProgress.remainingMin : activeRoute.durationMin,
      nextInstruction: nextTurn?.step.instruction || 'Tiếp tục theo lộ trình',
      nextArrow: nextTurn?.step.arrow || '⬆️',
      nextDistM: nextTurn?.distM || 0,
      isRerouting,
      isRouteOverview,
      voiceNavEnabled,
    });
  }, [
    activeRoute,
    routeProgress,
    nextTurn,
    isRerouting,
    isRouteOverview,
    voiceNavEnabled,
    onActiveNavChange,
  ]);

  const handleSendPlaceToCar = async (pl: PlaceItem, idx: number) => {
    if (syncCode.length < 4) {
      onNotifyToast?.('Hãy gắn Mã Xe VF5 (trong mục Playlist) trước khi gửi điểm đến.');
      return;
    }
    setSendingToCarIdx(idx);
    const res = await sendNavToCar(syncCode, {
      name: pl.name,
      subtitle: pl.subtitle,
      lat: pl.lat,
      lon: pl.lon,
    });
    setSendingToCarIdx(null);
    if (res.success) {
      onNotifyToast?.(`📲 Đã gửi "${pl.name}" lên màn hình xe VF5-${syncCode}!`);
    } else {
      onNotifyToast?.(res.error || 'Không gửi được điểm đến lên xe.');
    }
  };

  const homePlace = savedPlaces.find((p) => p.slot === 'home');
  const workPlace = savedPlaces.find((p) => p.slot === 'work');
  const customSavedPlaces = savedPlaces.filter((p) => p.slot !== 'home' && p.slot !== 'work');

  const handleQuickPinSlot = (slot: 'home' | 'work', pl?: PlaceItem) => {
    const targetLat = pl ? pl.lat : position.lat;
    const targetLon = pl ? pl.lon : position.lon;
    const name = pl ? pl.name : slot === 'home' ? 'Nhà riêng' : 'Cơ quan';
    const subtitle = pl
      ? pl.subtitle
      : roadInfo?.roadName || `${targetLat.toFixed(4)}, ${targetLon.toFixed(4)}`;

    onSavePlace({
      id: `slot-${slot}`,
      slot,
      icon: slot === 'home' ? '🏠' : '🏢',
      name,
      subtitle,
      lat: targetLat,
      lon: targetLon,
    });
    onNotifyToast?.(
      slot === 'home' ? `🏠 Đã ghim "${name}" làm Nhà riêng!` : `🏢 Đã ghim "${name}" làm Cơ quan!`
    );
  };

  const handleTogglePinCustomPlace = (pl: PlaceItem) => {
    const existing = savedPlaces.find(
      (s) =>
        s.slot === 'custom' &&
        Math.abs(s.lat - pl.lat) < 0.0005 &&
        Math.abs(s.lon - pl.lon) < 0.0005
    );
    if (existing) {
      onRemoveSavedPlace(existing.id);
      onNotifyToast?.(`Đã bỏ ghim "${pl.name}"`);
    } else {
      onSavePlace({
        id: `place-${Date.now()}`,
        slot: 'custom',
        icon: '⭐',
        name: pl.name,
        subtitle: pl.subtitle,
        lat: pl.lat,
        lon: pl.lon,
      });
      onNotifyToast?.(`⭐ Đã ghim nhanh "${pl.name}"`);
    }
  };

  const speedValue = speedKmh !== null ? speedKmh : 0;
  const activeLimit = roadInfo?.speedLimit ?? null;
  const isOverLimit = activeLimit !== null && speedKmh !== null && speedValue > activeLimit;
  const isDangerOverLimit =
    activeLimit !== null && speedKmh !== null && speedValue >= activeLimit + 5;

  return (
    <div
      className={`cockpit-pane-cq relative w-full h-[320px] xs:h-[360px] car:h-full rounded-2xl sm:rounded-3xl overflow-hidden border shadow-2xl ${
        isLightMap ? 'bg-[#f8f4f0] border-slate-300' : 'bg-[#0b1220] border-white/15'
      }`}
    >
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
          1. CỤM HUD TỐC ĐỘ & BIỂN BÁO P.127 TRÊN BẢN ĐỒ (Chỉ hiện khi Mở rộng toàn màn hình;
             ở chế độ chia đôi Cockpit đã gom gọn vào cột cùng với phần Nhạc!)
         ===================================================================== */}
      {isMapExpanded && (
      <div
        onClick={gpsStatus !== 'active' ? requestGps : undefined}
        className={`absolute top-2 left-2 z-20 backdrop-blur-xl rounded-2xl border px-2.5 py-1.5 flex items-center gap-2.5 transition-colors ${
          isDangerOverLimit
            ? 'bg-rose-600 border-rose-300 ring-2 ring-rose-400/60 shadow-2xl'
            : isLightMap
            ? 'bg-white/96 border-slate-300 shadow-[0_8px_24px_rgba(15,23,42,0.2)]'
            : 'bg-[#0b1220]/94 border-slate-600 shadow-[0_10px_30px_rgba(0,0,0,0.8)]'
        } ${gpsStatus !== 'active' ? 'cursor-pointer' : ''}`}
      >
        <div className="flex flex-col">
          <div className="flex items-baseline gap-1">
            <span
              className={`text-3xl sm:text-4xl short:text-3xl font-black tabular-nums tracking-tighter leading-none ${
                isDangerOverLimit
                  ? 'text-white'
                  : speedKmh === null
                  ? isLightMap
                    ? 'text-slate-900'
                    : 'text-white'
                  : isOverLimit
                  ? isLightMap
                    ? 'text-amber-600'
                    : 'text-amber-300'
                  : isLightMap
                  ? 'text-emerald-700'
                  : 'text-emerald-300'
              }`}
            >
              {speedKmh !== null ? speedKmh : '0'}
            </span>
            <span
              className={`text-[10px] font-black ${
                isDangerOverLimit
                  ? 'text-rose-100'
                  : isLightMap
                  ? 'text-slate-600'
                  : 'text-slate-300'
              }`}
            >
              KM/H
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                gpsStatus === 'active' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
              }`}
            />
            <span
              className={`text-[9px] font-extrabold uppercase tracking-wider cq-hide-sm ${
                isDangerOverLimit
                  ? 'text-white'
                  : isLightMap
                  ? 'text-slate-700'
                  : 'text-slate-300'
              }`}
            >
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
                isDangerOverLimit
                  ? 'text-white'
                  : speedAlertSound
                  ? isLightMap
                    ? 'text-emerald-700'
                    : 'text-emerald-300'
                  : isLightMap
                  ? 'text-slate-400'
                  : 'text-slate-500'
              }`}
            >
              {speedAlertSound ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {activeLimit !== null && (
          <div className="flex flex-col items-center shrink-0">
            <div
              className={`w-11 h-11 sm:w-12 sm:h-12 short:w-10 short:h-10 rounded-full bg-white text-slate-950 border-[4px] border-[#e11d48] flex items-center justify-center shadow-md ${
                isDangerOverLimit ? 'scale-110 ring-2 ring-white animate-pulse' : ''
              }`}
            >
              <span className="text-sm sm:text-base short:text-sm font-black tracking-tighter leading-none">
                {activeLimit}
              </span>
            </div>
            <span
              className={`text-[8px] font-extrabold uppercase mt-0.5 ${
                isDangerOverLimit
                  ? 'text-white'
                  : roadInfo?.isVerifiedLimit
                  ? isLightMap
                    ? 'text-emerald-700'
                    : 'text-emerald-300'
                  : isLightMap
                  ? 'text-amber-700'
                  : 'text-amber-200'
              }`}
            >
              {roadInfo?.isVerifiedLimit ? 'OSM' : 'T.Khảo'}
            </span>
          </div>
        )}
      </div>
      )}

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
          title="Tìm đường, Địa điểm quen & Trạm sạc VinFast"
          className={`min-h-[36px] short:min-h-[32px] px-2.5 rounded-xl backdrop-blur-xl border text-xs font-extrabold flex items-center gap-1.5 shadow-lg active:scale-95 transition ${
            navDrawerOpen
              ? isLightMap
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-sky-400 text-slate-950 border-sky-300'
              : isLightMap
              ? 'bg-white/96 hover:bg-white text-blue-700 border-slate-300'
              : 'bg-[#0b1220]/94 hover:bg-slate-900 text-sky-300 border-slate-600'
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
          className={`min-h-[36px] short:min-h-[32px] px-2 rounded-xl backdrop-blur-xl border text-xs font-black flex items-center gap-1 shadow-lg active:scale-95 transition ${
            isLightMap
              ? 'bg-white/96 hover:bg-white border-slate-300 text-slate-900'
              : 'bg-[#0b1220]/94 hover:bg-slate-900 border-slate-600 text-white'
          }`}
        >
          <Compass
            className={`w-3.5 h-3.5 shrink-0 ${
              isLightMap ? 'text-emerald-600' : 'text-emerald-300'
            }`}
          />
          <span>{is3DHeadingUp ? '3D' : '2D'}</span>
        </button>

        <button
          type="button"
          onClick={cycleMapTheme}
          title="Đổi lớp bản đồ: 3D Sáng / 3D Đêm / OSM / Vệ tinh"
          className={`min-h-[36px] short:min-h-[32px] px-2 rounded-xl backdrop-blur-xl border text-xs font-extrabold flex items-center gap-1 shadow-lg active:scale-95 transition ${
            isLightMap
              ? 'bg-white/96 hover:bg-white border-slate-300 text-slate-900'
              : 'bg-[#0b1220]/94 hover:bg-slate-900 border-slate-600 text-white'
          }`}
        >
          <Layers
            className={`w-3.5 h-3.5 shrink-0 ${isLightMap ? 'text-amber-600' : 'text-amber-300'}`}
          />
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
              ? isLightMap
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-emerald-400 text-slate-950 border-emerald-300'
              : isLightMap
              ? 'bg-white/96 hover:bg-white text-emerald-700 border-slate-300'
              : 'bg-[#0b1220]/94 hover:bg-slate-900 text-emerald-300 border-slate-600'
          }`}
        >
          <Columns2 className="w-3.5 h-3.5 shrink-0" />
          <span className="cq-hide-md">Bố cục</span>
        </button>

        <button
          type="button"
          onClick={onToggleExpandMap}
          aria-label={isMapExpanded ? 'Thu gọn bản đồ về chia đôi' : 'Mở rộng bản đồ toàn màn hình'}
          className={`w-9 h-9 short:w-8 short:h-8 rounded-xl backdrop-blur-xl border flex items-center justify-center shadow-lg active:scale-95 transition ${
            isLightMap
              ? 'bg-white/96 hover:bg-white border-slate-300 text-blue-700'
              : 'bg-[#0b1220]/94 hover:bg-slate-900 border-slate-600 text-sky-300'
          }`}
        >
          {isMapExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* =====================================================================
          2B. BẢNG TÙY BIẾN VỊ TRÍ (TRÁI / PHẢI) & KÍCH THƯỚC BỀ NGANG COCKPIT
         ===================================================================== */}
      {layoutMenuOpen && (
        <div
          className={`absolute right-2 top-13 short:top-11 z-30 w-[288px] max-w-[calc(100%-16px)] max-h-[calc(100%-64px)] overflow-y-auto no-scrollbar backdrop-blur-2xl border rounded-2xl p-3 space-y-2.5 shadow-2xl animate-ios-sheet-in ${
            isLightMap
              ? 'bg-white/98 border-slate-300 text-slate-900'
              : 'bg-[#0b1220]/98 border-slate-600 text-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-black uppercase tracking-wider ${
                isLightMap ? 'text-slate-800' : 'text-slate-200'
              }`}
            >
              Tùy chỉnh bố cục Cockpit
            </span>
            <button
              type="button"
              onClick={() => setLayoutMenuOpen(false)}
              className={`w-6 h-6 rounded-full flex items-center justify-center ${
                isLightMap
                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1">
            <span
              className={`text-[11px] font-bold ${
                isLightMap ? 'text-slate-600' : 'text-slate-300'
              }`}
            >
              Vị trí hiển thị
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (mapSide !== 'left') onToggleMapSide();
                }}
                className={`min-h-[38px] px-2 rounded-xl border text-[11px] font-extrabold flex items-center justify-center gap-1 active:scale-95 transition ${
                  mapSide === 'left' && !isMapExpanded
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow'
                    : isLightMap
                    ? 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                    : 'bg-slate-800 text-slate-100 border-slate-600 hover:bg-slate-700'
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
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow'
                    : isLightMap
                    ? 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                    : 'bg-slate-800 text-slate-100 border-slate-600 hover:bg-slate-700'
                }`}
              >
                <span>🎵 Trái • 🗺️ Phải</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className={isLightMap ? 'text-slate-600' : 'text-slate-300'}>
                Độ rộng Bản đồ
              </span>
              <span
                className={`font-mono font-extrabold ${
                  isLightMap ? 'text-emerald-700' : 'text-emerald-300'
                }`}
              >
                {isMapExpanded
                  ? '100% (Toàn màn)'
                  : `Map ${mapWidthPct}% • Nhạc ${100 - mapWidthPct}%`}
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
                      ? isLightMap
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-950 border-white'
                      : isLightMap
                      ? 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                      : 'bg-slate-800 text-slate-100 border-slate-600 hover:bg-slate-700'
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
                    ? isLightMap
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-sky-400 text-slate-950 border-sky-300'
                    : isLightMap
                    ? 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                    : 'bg-slate-800 text-slate-100 border-slate-600 hover:bg-slate-700'
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
                className={isLightMap ? 'car-scrubber car-scrubber-light' : 'car-scrubber'}
              />
            )}

            <p
              className={`text-[10px] font-semibold flex items-center gap-1 ${
                isLightMap ? 'text-slate-600' : 'text-slate-400'
              }`}
            >
              <ArrowLeftRight className="w-3 h-3 shrink-0" />
              <span>Kéo nút cầm ở giữa 2 khung để chỉnh mượt!</span>
            </p>
          </div>

          <div
            className={`pt-2 border-t space-y-2 ${
              isLightMap ? 'border-slate-200' : 'border-slate-700/80'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span
                  className={`text-[11px] font-extrabold block ${
                    isLightMap ? 'text-slate-800' : 'text-slate-100'
                  }`}
                >
                  Tình trạng giao thông
                </span>
                <span
                  className={`text-[10px] font-semibold ${
                    isLightMap ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  {showTraffic ? `Cập nhật ${trafficUpdatedAt} • Tự động 2p` : 'Đang ẩn trên bản đồ'}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handleRefreshTrafficNow}
                  title="Làm mới dữ liệu giao thông ngay"
                  aria-label="Làm mới dữ liệu giao thông ngay"
                  className={`w-7 h-7 rounded-lg border flex items-center justify-center active:scale-95 transition ${
                    isLightMap
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleToggleTraffic}
                  className={`h-7 px-2.5 rounded-lg border text-[11px] font-extrabold active:scale-95 transition ${
                    showTraffic
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm'
                      : isLightMap
                      ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                      : 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700'
                  }`}
                >
                  {showTraffic ? 'Đang bật' : 'Đang tắt'}
                </button>
              </div>
            </div>

            <div
              className={`grid grid-cols-4 gap-1 rounded-xl p-1.5 text-[9.5px] font-extrabold ${
                isLightMap ? 'bg-slate-100 text-slate-700' : 'bg-slate-900/90 text-slate-200'
              }`}
            >
              <div className="flex items-center justify-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#16c964] shrink-0" />
                <span>Thông</span>
              </div>
              <div className="flex items-center justify-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#f59e0b] shrink-0" />
                <span>Đông</span>
              </div>
              <div className="flex items-center justify-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#ef4444] shrink-0" />
                <span>Ùn tắc</span>
              </div>
              <div className="flex items-center justify-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#991b1b] shrink-0" />
                <span>Tắc nặng</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          3. THẺ HƯỚNG DẪN RẼ TIẾP THEO (Chỉ hiện trên mặt bản đồ khi Mở rộng toàn màn hình;
             ở chế độ chia đôi Cockpit đã gom gọn sang cột Tốc độ • Thời tiết • Giờ!)
         ===================================================================== */}
      {isMapExpanded && activeRoute && !navDrawerOpen && !layoutMenuOpen && (
        <div
          className={`absolute top-[4.65rem] short:top-[4.1rem] left-2 z-20 max-w-[min(285px,calc(100%-16px))] backdrop-blur-xl border rounded-2xl p-2.5 flex flex-col gap-1.5 shadow-2xl ${
            isLightMap
              ? 'bg-blue-700 text-white border-blue-500'
              : 'bg-sky-950/96 text-white border-sky-400/70'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {isRerouting ? (
                <p className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Đang tính lại đường đi mới...</span>
                </p>
              ) : (
                nextTurn && (
                  <p className="text-xs font-black text-white leading-snug line-clamp-2">
                    {nextTurn.step.arrow} {nextTurn.step.instruction}
                    {nextTurn.distM > 0 ? ` (${nextTurn.distM}m)` : ''}
                  </p>
                )
              )}
              <div
                className={`flex items-center gap-1 text-[11px] font-bold truncate mt-0.5 ${
                  isLightMap ? 'text-sky-100' : 'text-sky-300'
                }`}
              >
                <Flag className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {activeRoute.destinationName} •{' '}
                  {routeProgress ? routeProgress.remainingKm : activeRoute.distanceKm} km (
                  {routeProgress ? routeProgress.remainingMin : activeRoute.durationMin}p)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  unlockCarAudio();
                  setVoiceNavEnabled((v) => {
                    const next = !v;
                    onNotifyToast?.(
                      next ? '🔊 Đã bật giọng nói chỉ đường tiếng Việt' : '🔇 Đã tắt giọng nói chỉ đường'
                    );
                    return next;
                  });
                }}
                aria-label="Bật hoặc tắt giọng nói chỉ đường"
                title={voiceNavEnabled ? 'Đang bật giọng nói chỉ đường' : 'Đang tắt giọng nói chỉ đường'}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
                  voiceNavEnabled
                    ? 'bg-emerald-400 text-slate-950'
                    : 'bg-white/20 text-white/70 hover:bg-white/30'
                }`}
              >
                {voiceNavEnabled ? (
                  <Volume2 className="w-3.5 h-3.5" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveRoute(null)}
                aria-label="Hủy lộ trình"
                className="w-7 h-7 rounded-full bg-white/20 hover:bg-rose-500 text-white flex items-center justify-center transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {isRouteOverview && (
            <button
              type="button"
              onClick={() => {
                setIsRouteOverview(false);
                setIsFollowing(true);
              }}
              className="w-full min-h-[32px] rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 shadow active:scale-95 transition"
            >
              <Play className="w-3.5 h-3.5 fill-slate-950" />
              <span>Bắt đầu đi (Bám mũi xe 3D)</span>
            </button>
          )}
        </div>
      )}

      {/* =====================================================================
          4. HỘP TÌM ĐỊA ĐIỂM, GHIM NHÀ/CƠ QUAN & GỬI LÊN XE (SEND-TO-CAR)
         ===================================================================== */}
      {navDrawerOpen && (
        <div
          className={`absolute inset-x-2 top-13 short:top-11 ${
            isMapExpanded ? 'bottom-12' : 'bottom-2'
          } z-30 backdrop-blur-2xl border rounded-2xl p-2.5 flex flex-col gap-2 animate-ios-sheet-in ${
            isLightMap
              ? 'bg-white/98 border-slate-300 text-slate-950 shadow-[0_16px_44px_rgba(15,23,42,0.3)]'
              : 'bg-[#0b1220]/98 border-slate-600 text-white shadow-[0_16px_44px_rgba(0,0,0,0.88)]'
          }`}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (placeQuery.trim()) runPlaceSearch(placeQuery.trim());
            }}
            className="flex items-center gap-1.5 shrink-0"
          >
            <div className="relative flex-1">
              <Search
                className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                  isLightMap ? 'text-slate-500' : 'text-slate-400'
                }`}
              />
              <input
                type="search"
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                placeholder="Gõ điểm đến (có dấu hoặc không dấu: ho guom, vincom...)"
                className={`w-full h-9 pl-9 pr-8 rounded-xl border text-xs sm:text-sm font-bold focus:outline-none transition-colors ${
                  isLightMap
                    ? 'bg-slate-100 border-slate-300 text-slate-950 placeholder-slate-500 focus:bg-white focus:border-blue-600'
                    : 'bg-slate-800 border-slate-600 text-white placeholder-slate-400 focus:bg-slate-900 focus:border-sky-400'
                }`}
              />
              {placeQuery && (
                <button
                  type="button"
                  onClick={() => setPlaceQuery('')}
                  aria-label="Xóa từ khóa tìm kiếm"
                  className={`w-6 h-6 rounded-full absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center ${
                    isLightMap
                      ? 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'
                      : 'text-slate-400 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className={`h-9 px-3.5 rounded-xl font-extrabold text-xs shrink-0 shadow-sm active:scale-95 transition ${
                isLightMap
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-sky-400 hover:bg-sky-300 text-slate-950'
              }`}
            >
              Tìm
            </button>
            <button
              type="button"
              onClick={() => setNavDrawerOpen(false)}
              aria-label="Đóng hộp tìm kiếm bản đồ"
              className={`h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 active:scale-95 transition ${
                isLightMap
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </form>

          {/* Hàng 1: Địa điểm quen thuộc 1 chạm (🏠 Về nhà, 🏢 Cơ quan & các điểm đã ghim) */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            <button
              type="button"
              onClick={() => {
                if (homePlace) {
                  startRouteTo({ name: homePlace.name, lat: homePlace.lat, lon: homePlace.lon });
                } else {
                  handleQuickPinSlot('home');
                }
              }}
              className={`min-h-[30px] px-2.5 rounded-full border text-[11px] font-extrabold whitespace-nowrap flex items-center gap-1 active:scale-95 transition ${
                homePlace
                  ? isLightMap
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                    : 'bg-indigo-500 border-indigo-400 text-white shadow-sm'
                  : isLightMap
                  ? 'bg-indigo-50 border-dashed border-indigo-400 text-indigo-800 hover:bg-indigo-100'
                  : 'bg-indigo-950/80 border-dashed border-indigo-400/60 text-indigo-200 hover:bg-indigo-900'
              }`}
            >
              <Home className="w-3 h-3 shrink-0" />
              <span>{homePlace ? `Về nhà` : 'Ghim vị trí Nhà'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (workPlace) {
                  startRouteTo({ name: workPlace.name, lat: workPlace.lat, lon: workPlace.lon });
                } else {
                  handleQuickPinSlot('work');
                }
              }}
              className={`min-h-[30px] px-2.5 rounded-full border text-[11px] font-extrabold whitespace-nowrap flex items-center gap-1 active:scale-95 transition ${
                workPlace
                  ? isLightMap
                    ? 'bg-amber-600 border-amber-600 text-white shadow-sm'
                    : 'bg-amber-500 border-amber-400 text-slate-950 shadow-sm'
                  : isLightMap
                  ? 'bg-amber-50 border-dashed border-amber-400 text-amber-900 hover:bg-amber-100'
                  : 'bg-amber-950/80 border-dashed border-amber-400/60 text-amber-200 hover:bg-amber-900'
              }`}
            >
              <Briefcase className="w-3 h-3 shrink-0" />
              <span>{workPlace ? `Cơ quan` : 'Ghim Cơ quan'}</span>
            </button>

            {customSavedPlaces.map((sp) => (
              <div
                key={sp.id}
                className={`min-h-[30px] rounded-full border flex items-center overflow-hidden shrink-0 ${
                  isLightMap
                    ? 'bg-slate-100 border-slate-300 text-slate-900'
                    : 'bg-slate-800 border-slate-600 text-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => startRouteTo({ name: sp.name, lat: sp.lat, lon: sp.lon })}
                  className="px-2.5 py-1 text-[11px] font-extrabold whitespace-nowrap flex items-center gap-1 active:scale-95"
                >
                  <span>{sp.icon}</span>
                  <span className="max-w-[110px] truncate">{sp.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveSavedPlace(sp.id)}
                  aria-label={`Xóa điểm ghim ${sp.name}`}
                  className={`px-1.5 py-1 ${
                    isLightMap
                      ? 'text-slate-500 hover:text-rose-600'
                      : 'text-slate-400 hover:text-rose-300'
                  }`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Hàng 2: Danh mục tìm nhanh POI */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            {[
              { id: 'ev', label: 'Trạm sạc gần đây', icon: '⚡' },
              { id: 'parking', label: 'Bãi đỗ xe', icon: '🅿️' },
              { id: 'cafe', label: 'Cà phê', icon: '☕' },
              { id: 'mall', label: 'TTTM / Vincom', icon: '🏬' },
            ].map((chip) => {
              const isChipActive = activePlaceMode === chip.id && !placeQuery.trim();
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => {
                    setPlaceQuery('');
                    runPlaceSearch('', chip.id);
                  }}
                  className={`min-h-[30px] px-2.5 rounded-full border text-[11px] font-extrabold whitespace-nowrap flex items-center gap-1 active:scale-95 transition ${
                    isChipActive
                      ? chip.id === 'ev'
                        ? isLightMap
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                          : 'bg-emerald-400 border-emerald-300 text-slate-950 shadow-sm'
                        : isLightMap
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-sky-400 border-sky-300 text-slate-950 shadow-sm'
                      : chip.id === 'ev'
                      ? isLightMap
                        ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-400 text-emerald-900'
                        : 'bg-emerald-950 hover:bg-emerald-900 border-emerald-500/60 text-emerald-300'
                      : isLightMap
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-100'
                  }`}
                >
                  <span>{chip.icon}</span>
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>

          {routeError && (
            <div
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold shrink-0 ${
                isLightMap
                  ? 'bg-rose-50 border-rose-300 text-rose-800'
                  : 'bg-rose-950/90 border-rose-500/60 text-rose-200'
              }`}
            >
              {routeError}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-1.5">
            {isSearchingPlaces || isRouting ? (
              <div
                className={`h-full flex items-center justify-center gap-2 text-xs font-extrabold ${
                  isLightMap ? 'text-slate-700' : 'text-slate-200'
                }`}
              >
                <Loader2
                  className={`w-4 h-4 animate-spin ${
                    isLightMap ? 'text-blue-600' : 'text-sky-400'
                  }`}
                />
                <span>{isRouting ? 'Đang tính lộ trình tối ưu...' : 'Đang tìm địa điểm...'}</span>
              </div>
            ) : placeResults.length === 0 ? (
              <p
                className={`text-center text-xs font-semibold py-4 ${
                  isLightMap ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                Không tìm thấy địa điểm — Hãy thử gõ tên đường / quận rõ hơn
              </p>
            ) : (
              placeResults.map((pl, idx) => {
                const isPinned = savedPlaces.some(
                  (s) =>
                    s.slot === 'custom' &&
                    Math.abs(s.lat - pl.lat) < 0.0005 &&
                    Math.abs(s.lon - pl.lon) < 0.0005
                );
                return (
                  <div
                    key={idx}
                    className={`w-full px-2.5 py-2 rounded-xl border flex items-center justify-between gap-1.5 transition ${
                      isLightMap
                        ? 'bg-slate-50 hover:bg-blue-50 border-slate-200/90'
                        : 'bg-slate-900/95 hover:bg-slate-800 border-slate-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => startRouteTo(pl)}
                      className="min-w-0 flex-1 text-left active:scale-99"
                    >
                      <h5
                        className={`text-xs sm:text-[13px] font-extrabold truncate ${
                          isLightMap ? 'text-slate-950' : 'text-white'
                        }`}
                      >
                        {pl.name}
                      </h5>
                      {pl.subtitle && (
                        <p
                          className={`text-[11px] font-semibold truncate mt-0.5 ${
                            isLightMap ? 'text-slate-600' : 'text-slate-300'
                          }`}
                        >
                          {pl.subtitle}
                        </p>
                      )}
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Ghim làm Nhà / Cơ quan / Yêu thích */}
                      <button
                        type="button"
                        onClick={() => handleQuickPinSlot('home', pl)}
                        title="Đặt làm Nhà riêng"
                        aria-label={`Đặt ${pl.name} làm Nhà riêng`}
                        className={`w-7 h-7 rounded-lg border flex items-center justify-center active:scale-90 transition cq-hide-sm ${
                          isLightMap
                            ? 'bg-white border-slate-300 text-slate-600 hover:text-indigo-700'
                            : 'bg-slate-800 border-slate-600 text-slate-300 hover:text-indigo-300'
                        }`}
                      >
                        <Home className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleTogglePinCustomPlace(pl)}
                        title={isPinned ? 'Bỏ ghim địa điểm' : 'Ghim địa điểm này'}
                        aria-label={isPinned ? `Bỏ ghim ${pl.name}` : `Ghim ${pl.name}`}
                        className={`w-7 h-7 rounded-lg border flex items-center justify-center active:scale-90 transition ${
                          isPinned
                            ? 'bg-amber-400 border-amber-400 text-slate-950'
                            : isLightMap
                            ? 'bg-white border-slate-300 text-slate-600 hover:text-amber-600'
                            : 'bg-slate-800 border-slate-600 text-slate-300 hover:text-amber-300'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${isPinned ? 'fill-slate-950' : ''}`} />
                      </button>

                      {/* Nút Send-to-Car: Gửi địa điểm từ Điện thoại lên màn hình xe VF5 */}
                      {syncCode.length >= 4 && (
                        <button
                          type="button"
                          disabled={sendingToCarIdx === idx}
                          onClick={() => handleSendPlaceToCar(pl, idx)}
                          title={`Gửi điểm đến lên màn VF5-${syncCode}`}
                          className={`h-7 px-2 rounded-lg border text-[10px] font-black flex items-center gap-1 active:scale-95 transition ${
                            isLightMap
                              ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                              : 'bg-emerald-500 border-emerald-400 text-slate-950 hover:bg-emerald-400'
                          }`}
                        >
                          {sendingToCarIdx === idx ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Send className="w-3 h-3" />
                          )}
                          <span className="cq-hide-sm">Gửi xe</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => startRouteTo(pl)}
                        className={`h-7 px-2.5 rounded-lg text-[11px] font-mono font-black shadow-sm active:scale-95 transition ${
                          isLightMap ? 'bg-blue-600 text-white' : 'bg-sky-400 text-slate-950'
                        }`}
                      >
                        Đi • {pl.distanceKm} km
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          5. CỤM HẠ TẦNG ĐƯỜNG BỘ, CAMERA & THỜI TIẾT NỔI Ở ĐÁY BẢN ĐỒ
         ===================================================================== */}
      <div className="absolute inset-x-2 bottom-2 z-20 flex flex-col gap-1.5 pointer-events-none">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          {isMapExpanded && (
            <div className="flex flex-wrap items-center gap-1.5">
              {roadInfo?.hazards?.map((hz, i) => (
                <span
                  key={i}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1 border backdrop-blur-xl shadow-lg ${
                    hz.type === 'camera'
                      ? 'bg-rose-600 border-rose-300 text-white animate-pulse'
                      : 'bg-amber-600 border-amber-300 text-white'
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
          )}

          <div className="flex items-center gap-1.5 ml-auto">
            {!webglError && (
              <button
                type="button"
                onClick={handleToggleTraffic}
                aria-label={showTraffic ? 'Tắt lớp tình trạng giao thông' : 'Bật lớp tình trạng giao thông'}
                title={
                  showTraffic
                    ? `Giao thông trực tiếp đang BẬT (cập nhật ${trafficUpdatedAt}) — Chạm để tắt`
                    : 'Chạm để bật hiển thị tình trạng giao thông trực tiếp'
                }
                className={`pointer-events-auto min-h-[32px] short:min-h-[28px] px-2.5 rounded-full backdrop-blur-xl border text-[11px] font-extrabold flex items-center gap-1.5 shadow-xl active:scale-95 transition ${
                  showTraffic
                    ? isLightMap
                      ? 'bg-white/96 hover:bg-white border-emerald-400 text-slate-900'
                      : 'bg-[#0b1220]/94 hover:bg-slate-900 border-emerald-500/70 text-white'
                    : isLightMap
                    ? 'bg-white/90 hover:bg-white border-slate-300 text-slate-500'
                    : 'bg-[#0b1220]/88 hover:bg-slate-900 border-slate-700 text-slate-400'
                }`}
              >
                <span className="flex items-center gap-[2px] shrink-0" aria-hidden="true">
                  <span
                    className={`w-1.5 h-3 rounded-full ${
                      showTraffic ? 'bg-[#16c964]' : 'bg-slate-400/70'
                    }`}
                  />
                  <span
                    className={`w-1.5 h-3 rounded-full ${
                      showTraffic ? 'bg-[#f59e0b]' : 'bg-slate-400/50'
                    }`}
                  />
                  <span
                    className={`w-1.5 h-3 rounded-full ${
                      showTraffic ? 'bg-[#ef4444]' : 'bg-slate-400/35'
                    }`}
                  />
                </span>
                <span className="whitespace-nowrap">
                  {showTraffic ? (
                    <>
                      <span className="cq-hide-sm">Giao thông</span>
                      <span className="cq-show-sm">GT</span>
                    </>
                  ) : (
                    <>
                      <span className="cq-hide-sm">GT: Tắt</span>
                      <span className="cq-show-sm">GT</span>
                    </>
                  )}
                </span>
                {showTraffic && (
                  <span
                    className={`cq-hide-md flex items-center gap-1.5 pl-1.5 ml-0.5 border-l text-[10px] font-bold ${
                      isLightMap
                        ? 'border-slate-300 text-slate-700'
                        : 'border-slate-700 text-slate-200'
                    }`}
                  >
                    <span className="flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#16c964]" />
                      Thông
                    </span>
                    <span className="flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                      Đông
                    </span>
                    <span className="flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />
                      Tắc
                    </span>
                  </span>
                )}
              </button>
            )}

            {(!isFollowing || isRouteOverview) && (
              <button
                type="button"
                onClick={() => {
                  setIsRouteOverview(false);
                  setIsFollowing(true);
                }}
                className="pointer-events-auto min-h-[34px] short:min-h-[30px] px-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-xl active:scale-95 transition"
              >
                <LocateFixed className="w-3.5 h-3.5" />
                <span>Bám mũi xe</span>
              </button>
            )}
          </div>
        </div>

        {isMapExpanded && (
        <div
          className={`backdrop-blur-xl border rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2 shadow-xl ${
            isLightMap
              ? 'bg-white/96 border-slate-300 text-slate-950'
              : 'bg-[#0b1220]/94 border-slate-600 text-white'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {roadInfo?.roadRef && (
              <span
                className={`px-1.5 py-0.5 rounded border text-[10px] font-black shrink-0 ${
                  isLightMap
                    ? 'bg-blue-100 border-blue-300 text-blue-900'
                    : 'bg-sky-500/25 border-sky-400/50 text-sky-200'
                }`}
              >
                {roadInfo.roadRef}
              </span>
            )}
            <span
              className={`text-xs font-extrabold truncate ${
                isLightMap ? 'text-slate-900' : 'text-white'
              }`}
            >
              {roadInfo?.roadName ||
                (gpsStatus === 'active'
                  ? 'Đang dò tên đường...'
                  : 'Bản đồ 3D VinFast VF5 (Chạm ô KM/H để bật GPS)')}
            </span>
            {roadInfo?.lanes && (
              <span
                className={`text-[10px] font-bold shrink-0 cq-hide-sm ${
                  isLightMap ? 'text-slate-600' : 'text-slate-300'
                }`}
              >
                • {roadInfo.lanes} làn
              </span>
            )}
          </div>

          <div
            className={`flex items-center gap-2 text-[11px] font-bold shrink-0 ${
              isLightMap ? 'text-slate-800' : 'text-slate-200'
            }`}
          >
            {weather && (
              <span
                className={
                  weather.isRainy
                    ? isLightMap
                      ? 'text-blue-700'
                      : 'text-sky-300'
                    : isLightMap
                    ? 'text-slate-800'
                    : 'text-slate-200'
                }
              >
                {weather.icon} {weather.temperature}°C
              </span>
            )}
            <span
              className={`font-mono font-black ${isLightMap ? 'text-slate-950' : 'text-white'}`}
            >
              {clockTime}
            </span>
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

export const CarCockpitMap = React.memo(CarCockpitMapInner);
export default CarCockpitMap;
