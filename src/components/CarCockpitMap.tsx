import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Map as MapLibreMap, Marker as MapLibreMarker, GeoJSONSource } from 'maplibre-gl';
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
  Sun,
  Moon,
  Loader2,
  Flag,
  Video as CameraIcon,
  AlertTriangle,
} from 'lucide-react';
import { CockpitTelemetry } from '../hooks/useCockpitTelemetry';

const DARK_MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const LIGHT_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

interface PlaceItem {
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
  distanceKm: number;
}

interface ActiveRoute {
  destinationName: string;
  destLat: number;
  destLon: number;
  distanceKm: number;
  durationMin: number;
  geometry: any;
}

interface CarCockpitMapProps {
  telemetry: CockpitTelemetry;
  clockTime: string;
  isMapExpanded: boolean;
  onToggleExpandMap: () => void;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
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

  const [isDarkMap, setIsDarkMap] = useState<boolean>(true);
  const [is3DHeadingUp, setIs3DHeadingUp] = useState<boolean>(true);
  const [isFollowing, setIsFollowing] = useState<boolean>(true);

  // Quick Navigation / EV Charging search state
  const [navDrawerOpen, setNavDrawerOpen] = useState<boolean>(false);
  const [placeQuery, setPlaceQuery] = useState<string>('');
  const [placeResults, setPlaceResults] = useState<PlaceItem[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState<boolean>(false);
  const [activeRoute, setActiveRoute] = useState<ActiveRoute | null>(null);
  const [isRouting, setIsRouting] = useState<boolean>(false);

  const activeRouteRef = useRef<ActiveRoute | null>(activeRoute);
  activeRouteRef.current = activeRoute;

  // Inject sovereign Vietnam labels + active route layers onto MapLibre style
  const applyCustomLayersToStyle = useCallback((map: MapLibreMap) => {
    try {
      // 1. Nhãn chủ quyền biển đảo Việt Nam (Hoàng Sa & Trường Sa)
      if (!map.getSource('vn-sovereignty')) {
        map.addSource('vn-sovereignty', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { title: 'Quần đảo Hoàng Sa (Việt Nam)' },
                geometry: { type: 'Point', coordinates: [112.0, 16.5] },
              },
              {
                type: 'Feature',
                properties: { title: 'Quần đảo Trường Sa (Việt Nam)' },
                geometry: { type: 'Point', coordinates: [114.2, 10.0] },
              },
            ],
          },
        });

        map.addLayer({
          id: 'vn-sovereignty-label',
          type: 'symbol',
          source: 'vn-sovereignty',
          layout: {
            'text-field': ['get', 'title'],
            'text-size': 12,
            'text-max-width': 12,
          },
          paint: {
            'text-color': '#38bdf8',
            'text-halo-color': '#020617',
            'text-halo-width': 2,
          },
        });
      }

      // 2. Lớp vẽ vệt dẫn đường OSRM phát sáng
      const route = activeRouteRef.current;
      if (!map.getSource('carhub-route')) {
        map.addSource('carhub-route', {
          type: 'geojson',
          data: route?.geometry
            ? { type: 'Feature', properties: {}, geometry: route.geometry }
            : { type: 'FeatureCollection', features: [] },
        });

        map.addLayer({
          id: 'carhub-route-glow',
          type: 'line',
          source: 'carhub-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#0ea5e9',
            'line-width': 11,
            'line-opacity': 0.35,
          },
        });

        map.addLayer({
          id: 'carhub-route-line',
          type: 'line',
          source: 'carhub-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#38bdf8',
            'line-width': 5.5,
            'line-opacity': 0.95,
          },
        });
      }
    } catch {}
  }, []);

  // Khởi tạo bản đồ WebGL 3D MapLibre
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: isDarkMap ? DARK_MAP_STYLE : LIGHT_MAP_STYLE,
      center: [position.lon, position.lat],
      zoom: 16.3,
      pitch: 55,
      bearing: position.heading || 0,
      attributionControl: false,
    });

    map.on('load', () => {
      applyCustomLayersToStyle(map);
    });

    map.on('styledata', () => {
      if (map.isStyleLoaded()) {
        applyCustomLayersToStyle(map);
      }
    });

    // Khi người lái kéo bản đồ bằng tay -> tạm dừng tự bám để xem trước đường
    map.on('dragstart', () => {
      setIsFollowing(false);
    });

    // Tạo con trỏ mũi tên định vị xe VF5 phát sáng
    const puckWrap = document.createElement('div');
    puckWrap.style.width = '44px';
    puckWrap.style.height = '44px';
    puckWrap.style.display = 'flex';
    puckWrap.style.alignItems = 'center';
    puckWrap.style.justifyContent = 'center';
    puckWrap.style.pointerEvents = 'none';

    puckWrap.innerHTML = `
      <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;inset:0;border-radius:9999px;background:rgba(16,185,129,0.28);box-shadow:0 0 22px rgba(16,185,129,0.65);"></div>
        <div data-arrow="1" style="position:relative;width:30px;height:30px;border-radius:9999px;background:#10b981;border:3px solid #ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;transition:transform 250ms ease;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="#04130d">
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

    const resizeObs = new ResizeObserver(() => {
      map.resize();
    });
    resizeObs.observe(mapContainerRef.current);

    return () => {
      resizeObs.disconnect();
      marker.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Đổi giao diện bản đồ Tối / Sáng
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(isDarkMap ? DARK_MAP_STYLE : LIGHT_MAP_STYLE);
  }, [isDarkMap]);

  // Cập nhật vị trí xe VF5 & góc quay Camera 3D mượt mà theo thời gian thực
  useEffect(() => {
    const map = mapRef.current;
    const marker = carMarkerRef.current;
    if (!map || !marker) return;

    marker.setLngLat([position.lon, position.lat]);

    const currentHeading = position.heading ?? 0;
    if (carArrowElRef.current) {
      // Ở chế độ 3D Mũi xe: bản đồ tự xoay theo hướng xe nên mũi tên hướng thẳng lên trước (0deg)
      // Ở chế độ 2D Hướng Bắc: bản đồ cố định Bắc nên mũi tên xoay theo góc la bàn của xe
      const arrowDeg = is3DHeadingUp && isFollowing ? 0 : currentHeading;
      carArrowElRef.current.style.transform = `rotate(${arrowDeg}deg)`;
    }

    if (isFollowing) {
      map.easeTo({
        center: [position.lon, position.lat],
        zoom: is3DHeadingUp ? 16.4 : 15.6,
        pitch: is3DHeadingUp ? 56 : 0,
        bearing: is3DHeadingUp ? currentHeading : 0,
        padding: is3DHeadingUp
          ? { top: 75, bottom: 15, left: 0, right: 0 }
          : { top: 20, bottom: 20, left: 0, right: 0 },
        duration: 650,
      });
    }
  }, [position.lat, position.lon, position.heading, isFollowing, is3DHeadingUp]);

  // Cập nhật dữ liệu vệt đường OSRM lên bản đồ
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const src = map.getSource('carhub-route') as GeoJSONSource | undefined;
    if (src) {
      src.setData(
        activeRoute?.geometry
          ? { type: 'Feature', properties: {}, geometry: activeRoute.geometry }
          : { type: 'FeatureCollection', features: [] }
      );
    }

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
    }
  }, [activeRoute]);

  // Ghim biểu tượng Camera / Cảnh báo hạ tầng trực tiếp lên mặt bản đồ 3D
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

  // Tìm kiếm địa điểm hoặc Trạm sạc VinFast gần xe
  const runPlaceSearch = async (queryText: string, mode = '') => {
    setIsSearchingPlaces(true);
    try {
      const url = `/api/places?lat=${position.lat.toFixed(4)}&lon=${position.lon.toFixed(4)}${
        mode ? `&mode=${encodeURIComponent(mode)}` : `&q=${encodeURIComponent(queryText)}`
      }`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setPlaceResults(Array.isArray(data.items) ? data.items : []);
      }
    } catch {
      setPlaceResults([]);
    } finally {
      setIsSearchingPlaces(false);
    }
  };

  // Tính toán đường đi thực tế qua OSRM & bắt đầu dẫn đường trên màn VF5
  const startRouteTo = async (place: PlaceItem) => {
    setIsRouting(true);
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${position.lon.toFixed(
        5
      )},${position.lat.toFixed(5)};${place.lon.toFixed(5)},${place.lat.toFixed(
        5
      )}?overview=full&geometries=geojson`;

      const res = await fetch(osrmUrl, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        const route = data?.routes?.[0];
        if (route?.geometry) {
          setActiveRoute({
            destinationName: place.name,
            destLat: place.lat,
            destLon: place.lon,
            distanceKm: Math.round((route.distance / 1000) * 10) / 10,
            durationMin: Math.max(1, Math.round(route.duration / 60)),
            geometry: route.geometry,
          });
          setNavDrawerOpen(false);
          setIsFollowing(true);
        }
      }
    } catch {}
    setIsRouting(false);
  };

  const speedValue = speedKmh !== null ? speedKmh : 0;
  const activeLimit = roadInfo?.speedLimit ?? null;
  const isOverLimit = activeLimit !== null && speedKmh !== null && speedValue > activeLimit;
  const isDangerOverLimit =
    activeLimit !== null && speedKmh !== null && speedValue >= activeLimit + 5;

  const remainingRouteKm = activeRoute
    ? Math.max(
        0.1,
        Math.round(
          haversineKm(position.lat, position.lon, activeRoute.destLat, activeRoute.destLon) *
            1.25 *
            10
        ) / 10
      )
    : null;

  return (
    <div className="relative w-full h-full min-h-[210px] rounded-2xl sm:rounded-3xl overflow-hidden border border-white/15 shadow-2xl bg-[#090d16]">
      {/* KHUNG BẢN ĐỒ WEBGL 3D */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

      {/* =====================================================================
          1. CỤM HUD TỐC ĐỘ & BIỂN BÁO P.127 GÓC TRÊN BÊN TRÁI (Nổi trên mặt bản đồ!)
         ===================================================================== */}
      <div
        onClick={gpsStatus !== 'active' ? requestGps : undefined}
        className={`absolute top-2.5 left-2.5 z-20 backdrop-blur-xl rounded-2xl border px-3 py-2 flex items-center gap-3 shadow-[0_10px_30px_rgba(0,0,0,0.75)] transition-colors ${
          isDangerOverLimit
            ? 'bg-rose-950/90 border-rose-500 ring-2 ring-rose-500/50'
            : 'bg-black/75 border-white/20'
        } ${gpsStatus !== 'active' ? 'cursor-pointer' : ''}`}
      >
        {/* Số KM/H */}
        <div className="flex flex-col">
          <div className="flex items-baseline gap-1">
            <span
              className={`text-4xl sm:text-5xl short:text-3xl font-black tabular-nums tracking-tighter leading-none ${
                speedKmh === null
                  ? 'text-white/60'
                  : isDangerOverLimit
                  ? 'text-rose-400'
                  : isOverLimit
                  ? 'text-amber-300'
                  : 'text-emerald-300'
              }`}
            >
              {speedKmh !== null ? speedKmh : '--'}
            </span>
            <span className="text-[10px] font-black text-white/60">KM/H</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                gpsStatus === 'active' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-white/65">
              {gpsStatus === 'active'
                ? isDangerOverLimit
                  ? 'QUÁ TỐC ĐỘ!'
                  : 'GPS LIVE'
                : 'Bật GPS'}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSpeedAlertSound();
              }}
              aria-label="Bật hoặc tắt chuông cảnh báo quá tốc độ"
              className={`ml-0.5 p-1 rounded-full ${
                speedAlertSound ? 'text-emerald-300' : 'text-white/40'
              }`}
            >
              {speedAlertSound ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Biển Giới Hạn Tốc Độ Tròn Viền Đỏ QCVN */}
        {activeLimit !== null && (
          <div className="flex flex-col items-center shrink-0">
            <div
              className={`w-12 h-12 sm:w-13 sm:h-13 short:w-10 short:h-10 rounded-full bg-white text-black border-[4px] sm:border-[5px] border-[#e11d48] flex items-center justify-center shadow-lg ${
                isDangerOverLimit ? 'scale-110 ring-2 ring-rose-400 animate-pulse' : ''
              }`}
            >
              <span className="text-base sm:text-lg short:text-sm font-black tracking-tighter leading-none">
                {activeLimit}
              </span>
            </div>
            <span
              className={`text-[8px] font-extrabold uppercase mt-0.5 ${
                roadInfo?.isVerifiedLimit ? 'text-emerald-300' : 'text-amber-200/80'
              }`}
            >
              {roadInfo?.isVerifiedLimit ? 'OSM' : 'T.Khảo'}
            </span>
          </div>
        )}
      </div>

      {/* =====================================================================
          2. CỤM NÚT ĐIỀU KHIỂN BẢN ĐỒ GÓC TRÊN BÊN PHẢI
         ===================================================================== */}
      <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            const next = !navDrawerOpen;
            setNavDrawerOpen(next);
            if (next && placeResults.length === 0) {
              runPlaceSearch('', 'ev');
            }
          }}
          className={`min-h-[38px] short:min-h-[34px] px-3 rounded-xl backdrop-blur-xl border text-xs font-extrabold flex items-center gap-1.5 shadow-lg active:scale-95 transition ${
            navDrawerOpen
              ? 'bg-white text-black border-white'
              : 'bg-black/75 hover:bg-black/90 text-sky-200 border-white/20'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">Dẫn đường / Trạm sạc</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIs3DHeadingUp((v) => !v);
            setIsFollowing(true);
          }}
          title="Đổi góc nhìn 3D Mũi xe / 2D Hướng Bắc"
          className="min-h-[38px] short:min-h-[34px] px-2.5 rounded-xl bg-black/75 hover:bg-black/90 backdrop-blur-xl border border-white/20 text-white text-xs font-black flex items-center gap-1 shadow-lg active:scale-95 transition"
        >
          <Compass className="w-3.5 h-3.5 text-emerald-300" />
          <span>{is3DHeadingUp ? '3D' : '2D'}</span>
        </button>

        <button
          type="button"
          onClick={() => setIsDarkMap((v) => !v)}
          aria-label="Đổi màu bản đồ Sáng hoặc Tối"
          className="w-9 h-9 short:w-8 short:h-8 rounded-xl bg-black/75 hover:bg-black/90 backdrop-blur-xl border border-white/20 text-white flex items-center justify-center shadow-lg active:scale-95 transition"
        >
          {isDarkMap ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onToggleExpandMap}
          aria-label={isMapExpanded ? 'Thu gọn bản đồ về chia đôi' : 'Mở rộng bản đồ toàn màn hình'}
          title={isMapExpanded ? 'Chia đôi Bản đồ & Nhạc' : 'Phóng rộng Bản đồ'}
          className="w-9 h-9 short:w-8 short:h-8 rounded-xl bg-black/75 hover:bg-black/90 backdrop-blur-xl border border-white/20 text-white flex items-center justify-center shadow-lg active:scale-95 transition"
        >
          {isMapExpanded ? (
            <Minimize2 className="w-4 h-4 text-sky-300" />
          ) : (
            <Maximize2 className="w-4 h-4 text-sky-300" />
          )}
        </button>
      </div>

      {/* =====================================================================
          3. THANH DẪN ĐƯỜNG ĐANG CHẠY (Hiện khi đã chọn Đích đến / Trạm sạc)
         ===================================================================== */}
      {activeRoute && !navDrawerOpen && (
        <div className="absolute top-15 short:top-13 right-2.5 z-20 max-w-[260px] bg-sky-950/90 backdrop-blur-xl border border-sky-400/50 rounded-2xl px-3 py-2 flex items-center justify-between gap-2 shadow-2xl">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[11px] font-black text-sky-300 truncate">
              <Flag className="w-3 h-3 shrink-0" />
              <span className="truncate">{activeRoute.destinationName}</span>
            </div>
            <p className="text-xs font-extrabold text-white mt-0.5">
              Còn ~{remainingRouteKm ?? activeRoute.distanceKm} km • {activeRoute.durationMin} phút
            </p>
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
      )}

      {/* =====================================================================
          4. HỘP TÌM ĐỊA ĐIỂM & TRẠM SẠC VINFAST NHANH NGAY TRONG BẢN ĐỒ
         ===================================================================== */}
      {navDrawerOpen && (
        <div className="absolute inset-x-2.5 top-14 short:top-12 bottom-12 z-30 bg-black/90 backdrop-blur-2xl border border-white/20 rounded-2xl p-2.5 flex flex-col gap-2 shadow-2xl animate-ios-sheet-in">
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
                placeholder="Nhập địa chỉ, quán ăn, điểm đến..."
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

          {/* Nút 1-chạm tìm nhanh cho chủ xe điện VinFast VF5 */}
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

          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-1">
            {isSearchingPlaces || isRouting ? (
              <div className="h-full flex items-center justify-center gap-2 text-xs font-bold text-white/70">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{isRouting ? 'Đang kẻ lộ trình lái xe...' : 'Đang tìm địa điểm...'}</span>
              </div>
            ) : placeResults.length === 0 ? (
              <p className="text-center text-xs text-white/50 py-4">
                Nhập địa điểm rồi bấm Tìm hoặc chọn Trạm sạc VinFast
              </p>
            ) : (
              placeResults.map((pl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => startRouteTo(pl)}
                  className="w-full text-left px-3 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.15] border border-white/10 flex items-center justify-between gap-2 active:scale-99 transition"
                >
                  <div className="min-w-0">
                    <h5 className="text-xs font-extrabold text-white truncate">{pl.name}</h5>
                    {pl.subtitle && (
                      <p className="text-[10px] text-white/55 truncate">{pl.subtitle}</p>
                    )}
                  </div>
                  <span className="text-[11px] font-mono font-extrabold text-sky-300 shrink-0">
                    {pl.distanceKm} km
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
      <div className="absolute inset-x-2.5 bottom-2 z-20 flex flex-col gap-1.5 pointer-events-none">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          {/* Cảnh báo Camera / Đèn đỏ phía trước */}
          <div className="flex flex-wrap items-center gap-1.5">
            {roadInfo?.hazards?.map((hz, i) => (
              <span
                key={i}
                className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1 border backdrop-blur-xl shadow-lg ${
                  hz.type === 'camera'
                    ? 'bg-rose-600/90 border-rose-300 text-white animate-pulse'
                    : 'bg-amber-600/90 border-amber-300 text-white'
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

          {/* Nút đưa tâm bản đồ quay lại mũi xe khi người dùng đã kéo lệch */}
          {!isFollowing && (
            <button
              type="button"
              onClick={() => setIsFollowing(true)}
              className="pointer-events-auto min-h-[34px] px-3 rounded-full bg-emerald-500 text-black text-xs font-black flex items-center gap-1.5 shadow-xl active:scale-95 transition"
            >
              <LocateFixed className="w-3.5 h-3.5" />
              <span>Bám mũi xe</span>
            </button>
          )}
        </div>

        {/* Thanh Tên Đường Hiện Tại + Giờ & Thời Tiết */}
        <div className="bg-black/80 backdrop-blur-xl border border-white/15 rounded-xl px-3 py-1.5 flex items-center justify-between gap-2 shadow-xl">
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
              <span className="text-[10px] font-bold text-white/55 shrink-0 hidden sm:inline">
                • {roadInfo.lanes} làn
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] font-bold text-white/85 shrink-0">
            {weather && (
              <span className={weather.isRainy ? 'text-sky-300' : 'text-white/80'}>
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
