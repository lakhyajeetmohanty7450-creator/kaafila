import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { AlertTriangle, Compass, Loader2 } from 'lucide-react';

const DEFAULT_CENTER = [33.15, 77.65]; // Ladakh/Himachal axis center when fitting overview
const DEFAULT_ZOOM = 7;

const CHECKPOINT_STYLE = {
  start: { bg: '#10B981', border: '#ECFDF5', label: 'Start' },
  checkpoint: { bg: '#F3C744', border: '#141615', label: 'Checkpoint' },
  rest_stop: { bg: '#38BDF8', border: '#082F49', label: 'Rest Stop' },
  fuel_stop: { bg: '#F97316', border: '#431407', label: 'Fuel Stop' },
  important: { bg: '#A855F7', border: '#FAF5FF', label: 'Key Landmark' },
  destination: { bg: '#EF4444', border: '#FEF2F2', label: 'Destination' },
};

function getTileConfig() {
  const rawUrl =
    import.meta.env.VITE_MAP_TILE_URL ||
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const apiKey = import.meta.env.VITE_MAP_API_KEY || '';
  const url = apiKey ? rawUrl.replace('{apiKey}', apiKey) : rawUrl;
  const attribution =
    import.meta.env.VITE_MAP_ATTRIBUTION ||
    '&copy; OpenStreetMap contributors &copy; CARTO';
  return { url, attribution };
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createPinIcon(type, seqLabel = '', verified = false) {
  const cfg = CHECKPOINT_STYLE[type] || CHECKPOINT_STYLE.checkpoint;
  const ring = verified ? 'box-shadow: 0 0 0 3px #10B981;' : 'box-shadow: 0 2px 8px rgba(0,0,0,0.65);';
  const textColor = type === 'checkpoint' ? '#141615' : '#FFFFFF';
  return L.divIcon({
    className: 'kaafila-map-pin',
    html: `<div style="width:28px;height:28px;border-radius:9999px;background:${cfg.bg};border:2px solid ${cfg.border};color:${textColor};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;${ring}">${escapeHtml(seqLabel || '•')}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

function createLiveRiderIcon(name = 'Rider') {
  const initial = escapeHtml(String(name || 'R').slice(0, 1).toUpperCase());
  return L.divIcon({
    className: 'kaafila-live-rider-pin',
    html: `<div style="position:relative;width:30px;height:30px;border-radius:9999px;background:#F3C744;border:2px solid #141615;color:#141615;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;box-shadow:0 0 0 4px rgba(243,199,68,0.3);">${initial}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
}

export default function KaafilaMap({
  route = null,
  checkpoints = [],
  arrivedCheckpointIds = [],
  liveTrackPoints = [],
  liveRiders = [],
  onMarkerSelect = null,
  onMapClick = null,
  loading = false,
  error = '',
  emptyTitle = 'No Route Data Published Yet',
  emptyDescription = 'The organising club has not uploaded coordinates or checkpoints for this expedition yet.',
  heightClass = 'h-[400px] sm:h-[480px]',
  showLegend = true,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerGroupRef = useRef(null);
  const [tileWarning, setTileWarning] = useState(false);

  const arrivedSet = useMemo(() => {
    if (arrivedCheckpointIds instanceof Set) return arrivedCheckpointIds;
    return new Set((arrivedCheckpointIds || []).map(String));
  }, [arrivedCheckpointIds]);

  const hasAnySpatialContent = useMemo(() => {
    const geomLen = route?.geometry?.coordinates?.length || 0;
    const hasStart = route?.startPoint?.coordinates?.length === 2;
    const hasEnd = route?.endPoint?.coordinates?.length === 2;
    return (
      geomLen >= 2 ||
      hasStart ||
      hasEnd ||
      (checkpoints && checkpoints.length > 0) ||
      (liveTrackPoints && liveTrackPoints.length > 0) ||
      (liveRiders && liveRiders.length > 0) ||
      Boolean(onMapClick)
    );
  }, [route, checkpoints, liveTrackPoints, liveRiders, onMapClick]);

  // Initialize Leaflet instance once container mounts
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    const { url, attribution } = getTileConfig();
    let loadedTiles = 0;
    let errorTiles = 0;

    const tileLayer = L.tileLayer(url, {
      attribution,
      maxZoom: 18,
    });
    tileLayer.on('tileload', () => {
      loadedTiles += 1;
      setTileWarning(false);
    });
    tileLayer.on('tileerror', () => {
      errorTiles += 1;
      if (loadedTiles === 0 && errorTiles >= 4) {
        setTileWarning(true);
      }
    });
    tileLayer.addTo(map);

    const featureGroup = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = featureGroup;

    const timer = setTimeout(() => map.invalidateSize(), 160);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => map.invalidateSize())
        : null;
    if (resizeObserver && containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timer);
      if (resizeObserver) resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Attach optional map click listener (for route/checkpoint editor)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onMapClick) return undefined;
    const handler = (e) => {
      onMapClick({
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6)),
      });
    };
    map.on('click', handler);
    return () => {
      map.off('click', handler);
    };
  }, [onMapClick]);

  // Render vectors, checkpoints, live track, and live rider markers
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const boundsPoints = [];

    // 1. Expedition Route Geometry Polyline
    const geomCoords = route?.geometry?.coordinates || [];
    if (geomCoords.length >= 2) {
      const latLngs = geomCoords.map(([lng, lat]) => [lat, lng]);
      L.polyline(latLngs, {
        color: '#F3C744',
        weight: 4,
        opacity: 0.9,
      }).addTo(group);
      boundsPoints.push(...latLngs);
    }

    // 2. Daily Segments if no full LineString was passed
    if (geomCoords.length < 2 && Array.isArray(route?.dailySegments)) {
      route.dailySegments.forEach((seg) => {
        if (Array.isArray(seg.coordinates) && seg.coordinates.length >= 2) {
          const latLngs = seg.coordinates.map(([lng, lat]) => [lat, lng]);
          L.polyline(latLngs, {
            color: '#F3C744',
            weight: 3.5,
            dashArray: '6 4',
            opacity: 0.85,
          }).addTo(group);
          boundsPoints.push(...latLngs);
        }
      });
    }

    // 3. Expedition Start & Destination endpoints (if not duplicated by checkpoints)
    if (route?.startPoint?.coordinates?.length === 2) {
      const [lng, lat] = route.startPoint.coordinates;
      boundsPoints.push([lat, lng]);
      if (!checkpoints.some((c) => c.type === 'start')) {
        const m = L.marker([lat, lng], { icon: createPinIcon('start', 'S') }).addTo(group);
        m.bindPopup(
          `<div class="text-xs"><strong class="text-emerald-400">Starting Point</strong><br/>${escapeHtml(route.startPoint.label || 'Start')}</div>`
        );
      }
    }

    if (route?.endPoint?.coordinates?.length === 2) {
      const [lng, lat] = route.endPoint.coordinates;
      boundsPoints.push([lat, lng]);
      if (!checkpoints.some((c) => c.type === 'destination')) {
        const m = L.marker([lat, lng], { icon: createPinIcon('destination', 'F') }).addTo(group);
        m.bindPopup(
          `<div class="text-xs"><strong class="text-red-400">Destination</strong><br/>${escapeHtml(route.endPoint.label || 'Finish')}</div>`
        );
      }
    }

    // 4. Official Checkpoints, Fuel Stops, Rest Stops, Important Markers
    checkpoints.forEach((cp, idx) => {
      if (!Array.isArray(cp.coordinates) || cp.coordinates.length !== 2) return;
      const [lng, lat] = cp.coordinates;
      const verified = arrivedSet.has(String(cp._id));
      const marker = L.marker([lat, lng], {
        icon: createPinIcon(cp.type, String(cp.sequenceNumber || idx + 1), verified),
      }).addTo(group);

      const typeLabel = CHECKPOINT_STYLE[cp.type]?.label || 'Checkpoint';
      marker.bindPopup(
        `<div style="min-width:170px;font-size:12px;line-height:1.45;">
          <div style="font-weight:700;color:#F3C744;">#${cp.sequenceNumber || idx + 1} · ${escapeHtml(cp.name)}</div>
          <div style="font-size:11px;color:#9ca3af;margin-top:2px;">${escapeHtml(typeLabel)}${cp.altitudeMeters ? ` · ${cp.altitudeMeters}m` : ''}</div>
          ${cp.description ? `<div style="margin-top:4px;color:#e7e1d2;">${escapeHtml(cp.description)}</div>` : ''}
          ${verified ? `<div style="margin-top:4px;font-weight:700;color:#34d399;">✓ Checkpoint Verified</div>` : ''}
        </div>`
      );

      marker.on('click', () => {
        if (onMarkerSelect) onMarkerSelect(cp);
      });

      boundsPoints.push([lat, lng]);
    });

    // 5. Rider GPS Track Polyline
    if (liveTrackPoints && liveTrackPoints.length >= 1) {
      const latLngs = liveTrackPoints
        .filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)))
        .map((p) => [Number(p.lat), Number(p.lng)]);
      if (latLngs.length >= 2) {
        L.polyline(latLngs, {
          color: '#10B981',
          weight: 4,
          opacity: 0.95,
        }).addTo(group);
      }
      if (latLngs.length >= 1) {
        const latest = latLngs[latLngs.length - 1];
        L.circleMarker(latest, {
          radius: 7,
          color: '#ECFDF5',
          fillColor: '#10B981',
          fillOpacity: 1,
          weight: 2,
        })
          .bindPopup('<div class="text-xs font-semibold">Your Current GPS Position</div>')
          .addTo(group);
        boundsPoints.push(...latLngs);
      }
    }

    // 6. Live Shared Group Riders (Opt-in Only)
    liveRiders.forEach((rider) => {
      if (!Number.isFinite(Number(rider.lat)) || !Number.isFinite(Number(rider.lng))) return;
      const latLng = [Number(rider.lat), Number(rider.lng)];
      const m = L.marker(latLng, {
        icon: createLiveRiderIcon(rider.fullName),
      }).addTo(group);
      const timeStr = rider.updatedAt ? new Date(rider.updatedAt).toLocaleTimeString() : 'Live';
      m.bindPopup(
        `<div style="font-size:12px;">
          <strong style="color:#F3C744;">${escapeHtml(rider.fullName)}</strong><br/>
          <span style="color:#9ca3af;">Updated: ${escapeHtml(timeStr)}</span>
          ${rider.speedKmh ? `<br/>Speed: ${Math.round(rider.speedKmh)} km/h` : ''}
        </div>`
      );
      boundsPoints.push(latLng);
    });

    if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0], 11);
    } else if (boundsPoints.length > 1) {
      map.fitBounds(boundsPoints, { padding: [36, 36], maxZoom: 13 });
    }
  }, [route, checkpoints, arrivedSet, liveTrackPoints, liveRiders, onMarkerSelect]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-kaafila-yellow/30 bg-kaafila-bg shadow-card">
      <div
        ref={containerRef}
        className={`w-full ${heightClass} ${onMapClick ? 'cursor-crosshair' : ''}`}
        aria-label="KAAFILA interactive Himalayan map"
      />

      {loading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-kaafila-bg/85 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-kaafila-yellow" />
          <p className="mt-2 font-mono text-xs uppercase tracking-wider text-kaafila-text">
            Loading Route Geometry...
          </p>
        </div>
      )}

      {!loading && error && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-kaafila-bg/90 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <p className="mt-2 text-sm font-semibold text-red-300">{error}</p>
        </div>
      )}

      {!loading && !error && !hasAnySpatialContent && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-kaafila-bg/90 p-6 text-center">
          <Compass className="h-9 w-9 text-kaafila-yellow/75" />
          <p className="mt-3 font-display text-xl font-bold uppercase text-kaafila-text">
            {emptyTitle}
          </p>
          <p className="mt-1 max-w-md text-xs text-kaafila-muted">{emptyDescription}</p>
        </div>
      )}

      {tileWarning && !loading && !error && (
        <div className="pointer-events-none absolute left-3 top-3 z-30 rounded-lg border border-kaafila-yellow/35 bg-kaafila-bg/90 px-3 py-1.5 text-[11px] text-kaafila-yellow">
          Basemap tiles offline — vector route & checkpoints remain active.
        </div>
      )}

      {showLegend && !loading && !error && (
        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 bg-kaafila-surface/95 px-4 py-2.5 text-[11px] text-kaafila-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Start / My GPS
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-kaafila-yellow" /> Route / Checkpoint
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Fuel Stop
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-400" /> Rest Stop
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Destination
          </span>
        </div>
      )}
    </div>
  );
}

