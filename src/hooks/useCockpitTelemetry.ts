import { useState, useEffect, useRef, useCallback } from 'react';

export interface WeatherInfo {
  temperature: number;
  label: string;
  icon: string;
  isRainy: boolean;
}

export interface CockpitTelemetry {
  speedKmh: number | null;
  gpsStatus: 'idle' | 'active' | 'denied' | 'unsupported';
  weather: WeatherInfo | null;
  requestGps: () => void;
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

export function useCockpitTelemetry(active: boolean): CockpitTelemetry {
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'active' | 'denied' | 'unsupported'>('idle');
  const [coords, setCoords] = useState<{ lat: number; lon: number }>(() => {
    try {
      const saved = localStorage.getItem('carhub_last_coords');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.lat === 'number' && typeof parsed.lon === 'number') {
          return parsed;
        }
      }
    } catch {}
    // Default fallback: Hà Nội, Việt Nam
    return { lat: 21.0285, lon: 105.8542 };
  });
  const [weather, setWeather] = useState<WeatherInfo | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const prevFixRef = useRef<{ lat: number; lon: number; time: number } | null>(null);
  const smoothedSpeedRef = useRef<number>(0);

  const startWatch = useCallback(() => {
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
        const { latitude, longitude, speed, accuracy } = pos.coords;
        const now = pos.timestamp || Date.now();

        setCoords((prev) => {
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
        if (typeof speed === 'number' && !isNaN(speed) && speed >= 0) {
          rawKmh = speed * 3.6;
        } else if (prevFixRef.current && accuracy <= 40) {
          const dtSec = (now - prevFixRef.current.time) / 1000;
          if (dtSec >= 0.8 && dtSec <= 10) {
            const distM = haversineMeters(
              prevFixRef.current.lat,
              prevFixRef.current.lon,
              latitude,
              longitude
            );
            rawKmh = (distM / dtSec) * 3.6;
          }
        }

        prevFixRef.current = { lat: latitude, lon: longitude, time: now };

        if (rawKmh !== null) {
          // Lọc nhiễu đứng yên tại đèn đỏ (< 2.6 km/h coi như 0 km/h)
          const clean = rawKmh < 2.6 ? 0 : Math.min(200, rawKmh);
          smoothedSpeedRef.current =
            clean === 0 ? 0 : smoothedSpeedRef.current * 0.35 + clean * 0.65;
          setSpeedKmh(Math.round(smoothedSpeedRef.current));
        } else {
          setSpeedKmh((prev) => (prev === null ? 0 : prev));
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
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        try {
          navigator.geolocation.clearWatch(watchIdRef.current);
        } catch {}
        watchIdRef.current = null;
      }
      return;
    }

    startWatch();
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        try {
          navigator.geolocation.clearWatch(watchIdRef.current);
        } catch {}
        watchIdRef.current = null;
      }
    };
  }, [active, startWatch]);

  // Lấy thời tiết thực tế từ Open-Meteo (miễn phí, không cần API key, nhẹ băng thông)
  useEffect(() => {
    let cancelled = false;
    const fetchWeather = async () => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat.toFixed(
            4
          )}&longitude=${coords.lon.toFixed(
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
      } catch {
        // Ignore weather fetch failure when offline
      }
    };

    fetchWeather();
    const timer = window.setInterval(fetchWeather, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [coords.lat, coords.lon]);

  return {
    speedKmh,
    gpsStatus,
    weather,
    requestGps: startWatch,
  };
}
