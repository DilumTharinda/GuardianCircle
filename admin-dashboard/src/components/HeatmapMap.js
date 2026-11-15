import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { extractCoords } from '../services/adminService';

const DEFAULT_CENTER = [6.9271, 79.8612];

export default function HeatmapMap({ reports }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: 13,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const bounds = [];

    // Cluster nearby unsafe reports into grid cells (~300m) for density heat visualization
    const grid = new Map();
    reports.forEach((report) => {
      if (report.status === 'removed') return;
      const coords = extractCoords(report.location);
      if (!coords) return;

      bounds.push([coords.lat, coords.lng]);
      const key = `${coords.lat.toFixed(3)}_${coords.lng.toFixed(3)}`;
      const existing = grid.get(key) || {
        lat: coords.lat,
        lng: coords.lng,
        count: 0,
        categories: new Set(),
      };
      existing.count += 1;
      if (report.category) existing.categories.add(report.category);
      grid.set(key, existing);
    });

    grid.forEach((cell) => {
      const intensity = Math.min(cell.count / 5, 1);
      const color =
        cell.count >= 4 ? '#dc2626' : cell.count >= 2 ? '#f59e0b' : '#3b82f6';

      // Outer heat halo
      L.circle([cell.lat, cell.lng], {
        radius: 140 + cell.count * 45,
        color: 'transparent',
        fillColor: color,
        fillOpacity: 0.22 + intensity * 0.25,
      }).addTo(layer);

      // Inner density core
      const core = L.circleMarker([cell.lat, cell.lng], {
        radius: 6 + Math.min(cell.count * 2, 10),
        color: '#ffffff',
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.85,
      });

      core.bindPopup(
        `<div>
          <strong>Density Cluster (${cell.count} report${cell.count > 1 ? 's' : ''})</strong><br/>
          <span>Categories: ${Array.from(cell.categories).join(', ') || 'General'}</span>
        </div>`
      );
      core.addTo(layer);
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    }
  }, [reports]);

  return (
    <div
      ref={mapContainerRef}
      className="leaflet-map-container"
      aria-label="Unsafe-location density heatmap"
    />
  );
}
