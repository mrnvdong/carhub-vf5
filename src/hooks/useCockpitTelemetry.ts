import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { CustomHazardPin, TripStats } from '../types';
import {
  playSpeedWarningBeep,
  speakVietnamese,
  unlockCarAudio,
} from '../services/voiceAudio';

export interface WeatherInfo {
  temperature: number;
  label: string;
  icon: string;
  isRainy: boolean;
}

export interface RoadHazard {
  type: 'camera' | 'toll' | 'railway' | 'school' | 'signals';
  label: string;
  distanceM: number;
  lat?: number;
  lon?: number;
}

export interface RoadInfraInfo {
  roadName: string | null;
  roadRef: string | null;
  roadTypeLabel: string | null;
  speedLimit: number | null;
  isVerifiedLimit: boolean;
  lanes: number | null;
  oneway: boolean;
  hazards: RoadHazard[];
}

export interface CockpitTelemetry {
  speedKmh: number | null;
  gpsStatus: 'idle' | 'active' | 'denied' | 'unsupported';
  position: { lat: number; lon: number; heading: number | null };
  weather: WeatherInfo | null;
  roadInfo: RoadInfraInfo | null;
  speedAlertSound: boolean;
  onToggleSpeedAlertSound: () => void;
  requestGps: () => void;
  tripStats: TripStats;
  resetTrip: () => void;
  fatigueWarning: boolean;
  nearbyCustomHazard: { pin: CustomHazardPin; distanceM: number } | null;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function decodeWeatherCode(code: number, isDay: boolean): {
  label: string;
  icon: string;
  isRainy: boolean;
} {
  if (code === 0 || code === 1) {
    return {
      label: isDay ? 'Trời nắng đẹp' : 'Đêm quang đãng',
      icon: isDay ? '☀️' : '🌙',
      isRainy: false,
    };
  }
  if (code === 2 || code === 3) {
    return { label: 'Nhiều mây', icon: '⛅', isRainy: false };
  }
  if (code === 45 || code === 48) {
    return { label: 'Sương mù • Chú ý tầm nhìn', icon: '🌫️', isRainy: false };
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return { label: 'Có mưa • Đường trơn', icon: '🌧️', isRainy: true };
  }
  if (code >= 95) {
    return { label: 'Giông mưa • Lái chậm', icon: '⛈️', isRainy: true };
  }
  return { label: 'Thời tiết ổn định', icon: '🌤️', isRainy: false };
}

export function useCockpitTelemetry(
  active: boolean,
  customHazards: CustomHazardPin[] = []
): CockpitTelemetry {
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'active' | 'denied' | 'unsupported'>('idle');
  const [weatherCoords, setWeatherCoords] = useState<{ lat: number; lon: number }>(() => {
    try {
      const saved = localStorage.getItem('carhub_last_coords');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.lat === 'number' && typeof parsed.lon === 'number') {
          return parsed;
        }
      }
    } catch {}
    return { lat: 21.0285, lon: 105.8542 };
  });

  const [livePosition, setLivePosition] = useState<{
    lat: number;
    lon: number;
    heading: number | null;
  }>(() => ({
    lat: weatherCoords.lat,
    lon: weatherCoords.lon,
    heading: null,
  }));

  const [liveGpsFix, setLiveGpsFix] = useState<{
    lat: number;
    lon: number;
    heading: number | null;
  } | null>(null);

  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [roadInfo, setRoadInfo] = useState<RoadInfraInfo | null>(null);
  const [tripStats, setTripStats] = useState<TripStats>(() => ({
    distanceKm: 0,
    elapsedSec: 0,
    avgSpeedKmh: 0,
    maxSpeedKmh: 0,
    startedAt: Date.now(),
  }));
  const [nearbyCustomHazard, setNearbyCustomHazard] = useState<{
    pin: CustomHazardPin;
    distanceM: number;
  } | null>(null);

  const customHazardsRef = useRef<CustomHazardPin[]>(customHazards);
  customHazardsRef.current = customHazards;
  const tripDistanceMRef = useRef<number>(0);
  const tripMaxSpeedRef = useRef<number>(0);
  const tripStartedAtRef = useRef<number>(Date.now());
  const fatigueAnnouncedRef = useRef<boolean>(false);

  const resetTrip = useCallback(() => {
    tripDistanceMRef.current = 0;
    tripMaxSpeedRef.current = 0;
    tripStartedAtRef.current = Date.now();
    fatigueAnnouncedRef.current = false;
    setTripStats({
      distanceKm: 0,
      elapsedSec: 0,
      avgSpeedKmh: 0,
      maxSpeedKmh: 0,
      startedAt: tripStartedAtRef.current,
    });
  }, []);

  const [speedAlertSound, setSpeedAlertSound] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('carhub_speed_beep');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const watchIdRef = useRef<number | null>(null);
  const prevFixRef = useRef<{ lat: number; lon: number; time: number } | null>(null);
  const smoothedSpeedRef = useRef<number>(0);
  const lastRoadQueryRef = useRef<{ lat: number; lon: number; time: number } | null>(null);
  const lastBeepAtRef = useRef<number>(0);
  const wasOverLimitRef = useRef<boolean>(false);
  const announcedCameraKeysRef = useRef<Map<string, number>>(new Map());

  const handleToggleSpeedAlertSound = useCallback(() => {
    unlockCarAudio();
    setSpeedAlertSound((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('carhub_speed_beep', String(next));
      } catch {}
      if (next) {
        playSpeedWarningBeep();
      }
      return next;
    });
  }, []);

  const startWatch = useCallback(() => {
    unlockCarAudio();
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGpsStatus('unsupported');
      return;
    }

    if (watchIdRef.current !== null) {
      try {
        navigator.geolocation.clearWatch(watchIdRef.current);
      } catch {}
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsStatus('active');
        const { latitude, longitude, speed, heading, accuracy } = pos.coords;
        const now = pos.timestamp || Date.now();

        setWeatherCoords((prev) => {
          if (Math.abs(prev.lat - latitude) > 0.02 || Math.abs(prev.lon - longitude) > 0.02) {
            const next = { lat: latitude, lon: longitude };
            try {
              localStorage.setItem('carhub_last_coords', JSON.stringify(next));
            } catch {}
            return next;
          }
          return prev;
        });

        let rawKmh: number | null = null;
        let computedHeading: number | null =
          typeof heading === 'number' && !isNaN(heading) && heading >= 0 ? heading : null;

        if (prevFixRef.current) {
          const distM = haversineMeters(
            prevFixRef.current.lat,
            prevFixRef.current.lon,
            latitude,
            longitude
          );
          const dtSec = (now - prevFixRef.current.time) / 1000;

          // Cộng dồn quãng đường hành trình (lọc nhiễu GPS < 12m và lọc nhảy sai > 65 m/s ≈ 234 km/h)
          if (accuracy <= 60 && distM >= 12 && dtSec > 0.3 && distM / dtSec <= 65) {
            tripDistanceMRef.current += distM;
          }

          if (computedHeading === null && distM >= 6) {
            computedHeading = bearingDegrees(
              prevFixRef.current.lat,
              prevFixRef.current.lon,
              latitude,
              longitude
            );
          }

          if ((typeof speed !== 'number' || isNaN(speed)) && accuracy <= 40 && dtSec >= 0.8 && dtSec <= 10) {
            rawKmh = (distM / dtSec) * 3.6;
          }
        }

        if (typeof speed === 'number' && !isNaN(speed) && speed >= 0) {
          rawKmh = speed * 3.6;
        }

        prevFixRef.current = { lat: latitude, lon: longitude, time: now };
        setLivePosition((prev) => ({
          lat: latitude,
          lon: longitude,
          heading: computedHeading !== null ? computedHeading : prev.heading,
        }));

        if (rawKmh !== null) {
          const clean = rawKmh < 2.6 ? 0 : Math.min(200, rawKmh);
          smoothedSpeedRef.current =
            clean === 0 ? 0 : smoothedSpeedRef.current * 0.35 + clean * 0.65;
          const roundedKmh = Math.round(smoothedSpeedRef.current);
          setSpeedKmh(roundedKmh);
          if (roundedKmh > tripMaxSpeedRef.current) {
            tripMaxSpeedRef.current = roundedKmh;
          }
        } else {
          setSpeedKmh((prev) => (prev === null ? 0 : prev));
        }

        // Kiểm tra điểm Camera / Điểm đen cá nhân đã ghim trong bán kính 350m
        const pins = customHazardsRef.current;
        if (pins.length > 0) {
          let closestPin: CustomHazardPin | null = null;
          let closestDist = Infinity;
          for (const pin of pins) {
            const d = haversineMeters(latitude, longitude, pin.lat, pin.lon);
            if (d < closestDist) {
              closestDist = d;
              closestPin = pin;
            }
          }
          if (closestPin && closestDist <= 350) {
            const roundedM = Math.max(10, Math.round(closestDist / 10) * 10);
            setNearbyCustomHazard({ pin: closestPin, distanceM: roundedM });
            const key = `custom-hz:${closestPin.id}`;
            const lastAt = announcedCameraKeysRef.current.get(key) || 0;
            if (Date.now() - lastAt > 90000) {
              announcedCameraKeysRef.current.set(key, Date.now());
              speakVietnamese(`Chú ý phía trước ${roundedM} mét có ${closestPin.label}`, {
                dedupeKey: key,
                cooldownMs: 85000,
                chime: true,
              });
            }
          } else {
            setNearbyCustomHazard(null);
          }
        } else {
          setNearbyCustomHazard(null);
        }

        // Cập nhật hạ tầng đường bộ lần đầu hoặc khi xe di chuyển >= 65m (và cách >= 4s)
        const lastQ = lastRoadQueryRef.current;
        const movedEnough =
          !lastQ ||
          (Date.now() - lastQ.time >= 4000 &&
            haversineMeters(lastQ.lat, lastQ.lon, latitude, longitude) >= 65);

        if (movedEnough) {
          lastRoadQueryRef.current = { lat: latitude, lon: longitude, time: Date.now() };
          setLiveGpsFix({ lat: latitude, lon: longitude, heading: computedHeading });
        }
      },
      (err) => {
        if (err.code === 1) {
          setGpsStatus('denied');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
    );
  }, []);

  useEffect(() => {
    if (!active) {
      if (
        watchIdRef.current !== null &&
        typeof navigator !== 'undefined' &&
        'geolocation' in navigator
      ) {
        try {
          navigator.geolocation.clearWatch(watchIdRef.current);
        } catch {}
        watchIdRef.current = null;
      }
      return;
    }

    startWatch();
    return () => {
      if (
        watchIdRef.current !== null &&
        typeof navigator !== 'undefined' &&
        'geolocation' in navigator
      ) {
        try {
          navigator.geolocation.clearWatch(watchIdRef.current);
        } catch {}
        watchIdRef.current = null;
      }
    };
  }, [active, startWatch]);

  // Truy vấn API hạ tầng đường bộ & biển tốc độ (/api/road)
  useEffect(() => {
    if (!active || !liveGpsFix) return;
    let cancelled = false;

    const queryRoad = async () => {
      try {
        const headingPart =
          liveGpsFix.heading !== null ? `&heading=${Math.round(liveGpsFix.heading)}` : '';
        const res = await fetch(
          `/api/road?lat=${liveGpsFix.lat.toFixed(5)}&lon=${liveGpsFix.lon.toFixed(5)}${headingPart}`,
          { signal: AbortSignal.timeout(5500) }
        );
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) return;
        const data = await res.json();
        if (cancelled || !data?.success) return;

        setRoadInfo({
          roadName: data.roadName || null,
          roadRef: data.roadRef || null,
          roadTypeLabel: data.roadTypeLabel || null,
          speedLimit: typeof data.speedLimit === 'number' ? data.speedLimit : null,
          isVerifiedLimit: Boolean(data.isVerifiedLimit),
          lanes: typeof data.lanes === 'number' ? data.lanes : null,
          oneway: Boolean(data.oneway),
          hazards: Array.isArray(data.hazards) ? data.hazards : [],
        });
      } catch {
        // Giữ nguyên thông tin tuyến đường trước đó nếu thoáng mất 4G
      }
    };

    queryRoad();
    return () => {
      cancelled = true;
    };
  }, [active, liveGpsFix]);

  // Cảnh báo âm thanh (đã unlock iOS) + giọng nói tiếng Việt khi vượt tốc độ >= +4 km/h
  useEffect(() => {
    if (!active || !speedAlertSound || speedKmh === null || !roadInfo?.speedLimit) {
      wasOverLimitRef.current = false;
      return;
    }

    const isSignificantlyOver = speedKmh >= roadInfo.speedLimit + 4;
    if (isSignificantlyOver && !wasOverLimitRef.current) {
      wasOverLimitRef.current = true;
      if (Date.now() - lastBeepAtRef.current > 18000) {
        lastBeepAtRef.current = Date.now();
        playSpeedWarningBeep();
        speakVietnamese(
          `Chú ý, giới hạn tốc độ ${roadInfo.speedLimit} ki lô mét trên giờ`,
          { dedupeKey: `speed-${roadInfo.speedLimit}`, cooldownMs: 22000 }
        );
      }
    } else if (speedKmh <= roadInfo.speedLimit) {
      wasOverLimitRef.current = false;
    }
  }, [active, speedAlertSound, speedKmh, roadInfo?.speedLimit]);

  // Cảnh báo giọng nói khi phát hiện Camera phạt nguội / Đường sắt phía trước (< 280m)
  useEffect(() => {
    if (!active || !speedAlertSound || !roadInfo?.hazards || roadInfo.hazards.length === 0) {
      return;
    }
    const now = Date.now();
    for (const hz of roadInfo.hazards) {
      if ((hz.type === 'camera' || hz.type === 'railway') && hz.distanceM <= 280) {
        const key = `${hz.type}:${(hz.lat ?? 0).toFixed(3)},${(hz.lon ?? 0).toFixed(3)}`;
        const lastAt = announcedCameraKeysRef.current.get(key) || 0;
        if (now - lastAt > 65000) {
          announcedCameraKeysRef.current.set(key, now);
          const msg =
            hz.type === 'camera'
              ? `Phía trước ${hz.distanceM} mét có ca me ra giám sát tốc độ`
              : `Phía trước ${hz.distanceM} mét có giao cắt đường sắt`;
          speakVietnamese(msg, { dedupeKey: key, cooldownMs: 60000, chime: true });
          break;
        }
      }
    }
  }, [active, speedAlertSound, roadInfo?.hazards]);

  // Lấy thời tiết thực tế từ Open-Meteo
  useEffect(() => {
    let cancelled = false;
    const fetchWeather = async () => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${weatherCoords.lat.toFixed(
            4
          )}&longitude=${weatherCoords.lon.toFixed(
            4
          )}&current=temperature_2m,weather_code,is_day&timezone=auto`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.current) return;

        const temp = Math.round(Number(data.current.temperature_2m || 28));
        const code = Number(data.current.weather_code ?? 0);
        const isDay = Number(data.current.is_day ?? 1) === 1;
        const decoded = decodeWeatherCode(code, isDay);

        setWeather({
          temperature: temp,
          label: decoded.label,
          icon: decoded.icon,
          isRainy: decoded.isRainy,
        });
      } catch {}
    };

    fetchWeather();
    const timer = window.setInterval(fetchWeather, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [weatherCoords.lat, weatherCoords.lon]);

  // Cập nhật Đồng Hồ Hành Trình (mỗi 5s) + nhắc nghỉ ngơi nếu lái liên tục >= 120 phút
  useEffect(() => {
    const id = window.setInterval(() => {
      const elapsedSec = Math.max(1, Math.floor((Date.now() - tripStartedAtRef.current) / 1000));
      const distanceKm = Math.round((tripDistanceMRef.current / 1000) * 100) / 100;
      const avgSpeedKmh =
        distanceKm >= 0.2 ? Math.round((distanceKm / (elapsedSec / 3600)) * 10) / 10 : 0;
      setTripStats({
        distanceKm,
        elapsedSec,
        avgSpeedKmh: Math.min(180, Math.round(avgSpeedKmh)),
        maxSpeedKmh: tripMaxSpeedRef.current,
        startedAt: tripStartedAtRef.current,
      });

      if (
        !fatigueAnnouncedRef.current &&
        elapsedSec >= 7200 &&
        distanceKm >= 40 &&
        speedAlertSound
      ) {
        fatigueAnnouncedRef.current = true;
        speakVietnamese('Bạn đã lái xe liên tục 2 tiếng, hãy nghỉ ngơi vài phút cho an toàn', {
          dedupeKey: 'fatigue-2h',
          cooldownMs: 3600000,
          chime: true,
        });
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [speedAlertSound]);

  const fatigueWarning = tripStats.elapsedSec >= 7200 && tripStats.distanceKm >= 20;

  // Bọc useMemo để tránh tạo object mới gây re-render CarCockpitMap 4 lần/giây khi YouTube cập nhật currentTime!
  return useMemo(
    () => ({
      speedKmh,
      gpsStatus,
      position: livePosition,
      weather,
      roadInfo,
      speedAlertSound,
      onToggleSpeedAlertSound: handleToggleSpeedAlertSound,
      requestGps: startWatch,
      tripStats,
      resetTrip,
      fatigueWarning,
      nearbyCustomHazard,
    }),
    [
      speedKmh,
      gpsStatus,
      livePosition,
      weather,
      roadInfo,
      speedAlertSound,
      handleToggleSpeedAlertSound,
      startWatch,
      tripStats,
      resetTrip,
      fatigueWarning,
      nearbyCustomHazard,
    ]
  );
}
