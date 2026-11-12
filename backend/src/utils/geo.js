const EARTH_RADIUS_M = 6371000;

export function isValidCoordPair(lng, lat) {
  return (
    typeof lng === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

export function normalizeLngLat(input) {
  if (!input) return null;
  if (Array.isArray(input) && input.length >= 2) {
    const lng = Number(input[0]);
    const lat = Number(input[1]);
    return isValidCoordPair(lng, lat) ? [lng, lat] : null;
  }
  if (typeof input === 'object') {
    const lng = Number(input.lng ?? input.lon ?? input.longitude);
    const lat = Number(input.lat ?? input.latitude);
    return isValidCoordPair(lng, lat) ? [lng, lat] : null;
  }
  return null;
}

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  return haversineMeters(lat1, lng1, lat2, lng2) / 1000;
}

export function computeLineStringDistanceKm(coordinates = []) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return 0;
  let meters = 0;
  let prev = null;
  for (const pt of coordinates) {
    const pair = normalizeLngLat(pt);
    if (!pair) continue;
    if (prev) {
      meters += haversineMeters(prev[1], prev[0], pair[1], pair[0]);
    }
    prev = pair;
  }
  return Number((meters / 1000).toFixed(2));
}

/**
 * Filter raw GPS points against accuracy, duplicate, and impossible-speed checks.
 * Produces deterministic estimatedDistanceKm vs verifiedDistanceKm and suspiciousFlags.
 */
export function analyzeAndFilterTrackPoints(rawPoints = [], options = {}) {
  const maxAccuracyMeters = options.maxAccuracyMeters ?? 100;
  const maxSpeedKmh = options.maxSpeedKmh ?? 180;
  const duplicateRadiusMeters = options.duplicateRadiusMeters ?? 4;
  const jumpMetersThreshold = options.jumpMetersThreshold ?? 2000;
  const jumpWindowSeconds = options.jumpWindowSeconds ?? 12;

  const sorted = (Array.isArray(rawPoints) ? rawPoints : [])
    .map((p, idx) => {
      const lng = Number(p.lng ?? p.lon ?? p.longitude);
      const lat = Number(p.lat ?? p.latitude);
      const ts = p.timestamp ? new Date(p.timestamp).getTime() : Date.now() + idx * 1000;
      const accuracyMeters =
        p.accuracyMeters !== undefined && p.accuracyMeters !== null && Number.isFinite(Number(p.accuracyMeters))
          ? Math.max(0, Number(p.accuracyMeters))
          : 25;
      const altitudeMeters =
        p.altitudeMeters !== undefined && p.altitudeMeters !== null && Number.isFinite(Number(p.altitudeMeters))
          ? Number(p.altitudeMeters)
          : undefined;
      return { lng, lat, ts, accuracyMeters, altitudeMeters, originalIndex: idx };
    })
    .filter((p) => isValidCoordPair(p.lng, p.lat) && Number.isFinite(p.ts))
    .sort((a, b) => a.ts - b.ts);

  let estimatedMeters = 0;
  let verifiedMeters = 0;
  let filteredPoorAccuracy = 0;
  let filteredDuplicates = 0;
  let filteredJumps = 0;
  let maxObservedSpeedKmh = 0;
  let accuracySum = 0;
  let accuracyCount = 0;

  const acceptedPoints = [];
  const suspiciousFlags = [];
  let prevRaw = null;
  let prevVerified = null;

  for (let i = 0; i < sorted.length; i += 1) {
    const pt = sorted[i];
    accuracySum += pt.accuracyMeters;
    accuracyCount += 1;

    if (prevRaw) {
      const dtSec = Math.max(0.5, (pt.ts - prevRaw.ts) / 1000);
      const stepMeters = haversineMeters(prevRaw.lat, prevRaw.lng, pt.lat, pt.lng);

      if (stepMeters < duplicateRadiusMeters && dtSec < 15) {
        filteredDuplicates += 1;
        continue;
      }

      estimatedMeters += stepMeters;
      prevRaw = pt;
    } else {
      prevRaw = pt;
    }

    if (pt.accuracyMeters > maxAccuracyMeters) {
      filteredPoorAccuracy += 1;
      continue;
    }

    if (prevVerified) {
      const dtSec = Math.max(0.5, (pt.ts - prevVerified.ts) / 1000);
      const stepMeters = haversineMeters(prevVerified.lat, prevVerified.lng, pt.lat, pt.lng);

      if (stepMeters < duplicateRadiusMeters && dtSec < 15) {
        continue;
      }

      const speedKmh = (stepMeters / 1000) / (dtSec / 3600);
      if (speedKmh > maxObservedSpeedKmh) {
        maxObservedSpeedKmh = speedKmh;
      }

      const isImpossibleSpeed = speedKmh > maxSpeedKmh;
      const isSuddenJump = stepMeters > jumpMetersThreshold && dtSec <= jumpWindowSeconds;

      if (isImpossibleSpeed || isSuddenJump) {
        filteredJumps += 1;
        suspiciousFlags.push({
          code: isSuddenJump ? 'gps_jump' : 'impossible_speed',
          reason: `Detected ${Math.round(stepMeters)}m displacement in ${dtSec.toFixed(1)}s (${Math.round(speedKmh)} km/h).`,
          detectedAt: new Date(pt.ts),
        });
        continue;
      }

      verifiedMeters += stepMeters;
    }

    prevVerified = pt;
    acceptedPoints.push({
      lng: Number(pt.lng.toFixed(6)),
      lat: Number(pt.lat.toFixed(6)),
      accuracyMeters: Math.round(pt.accuracyMeters),
      ...(pt.altitudeMeters !== undefined ? { altitudeMeters: Math.round(pt.altitudeMeters) } : {}),
      timestamp: new Date(pt.ts),
    });
  }

  return {
    estimatedDistanceKm: Number((estimatedMeters / 1000).toFixed(2)),
    verifiedDistanceKm: Number((verifiedMeters / 1000).toFixed(2)),
    acceptedPoints,
    suspiciousFlags,
    stats: {
      totalPoints: sorted.length,
      acceptedCount: acceptedPoints.length,
      filteredPoorAccuracy,
      filteredDuplicates,
      filteredJumps,
      maxObservedSpeedKmh: Number(maxObservedSpeedKmh.toFixed(1)),
      averageAccuracyMeters: accuracyCount > 0 ? Math.round(accuracySum / accuracyCount) : 0,
    },
  };
}

/**
 * Create a privacy-safe simplified summary route for optional public rider display.
 * Trims start/end buffers and coarsens coordinates (~110m precision) so home locations are never leaked.
 */
export function createSimplifiedPublicRoute(points = [], maxVertices = 36) {
  const valid = (Array.isArray(points) ? points : [])
    .map((p) => normalizeLngLat(p))
    .filter(Boolean);

  if (valid.length < 5) return [];

  const trimCount = Math.max(1, Math.floor(valid.length * 0.1));
  const middle = valid.slice(trimCount, valid.length - trimCount);
  if (middle.length < 2) return [];

  const step = Math.max(1, Math.ceil(middle.length / maxVertices));
  const sampled = [];
  for (let i = 0; i < middle.length; i += step) {
    sampled.push([Number(middle[i][0].toFixed(3)), Number(middle[i][1].toFixed(3))]);
  }
  const last = middle[middle.length - 1];
  const lastRounded = [Number(last[0].toFixed(3)), Number(last[1].toFixed(3))];
  const prev = sampled[sampled.length - 1];
  if (!prev || prev[0] !== lastRounded[0] || prev[1] !== lastRounded[1]) {
    sampled.push(lastRounded);
  }
  return sampled;
}

