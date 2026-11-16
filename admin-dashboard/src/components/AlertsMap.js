import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { extractCoords, toDate } from '../services/adminService';

const DEFAULT_CENTER = [6.9271, 79.8612]; // Fallback center

export default function AlertsMap({ alerts, selectedAlertId, onSelectAlert }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);

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

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const bounds = [];

    alerts.forEach((alert) => {
      const coords = extractCoords(alert.location);
      if (!coords) return;

      bounds.push([coords.lat, coords.lng]);
      const isSelected = alert.id === selectedAlertId;

      const marker = L.circleMarker([coords.lat, coords.lng], {
        radius: isSelected ? 12 : 9,
        color: '#ffffff',
        weight: 2.5,
        fillColor: '#ef4444',
        fillOpacity: 0.9,
      });

      const ts = toDate(alert.timestamp || alert.createdAt);
      const timeStr = ts ? ts.toLocaleString() : 'Unknown time';

      marker.bindPopup(
        `<div style="min-width:180px">
          <strong style="color:#dc2626">ACTIVE SOS ALERT</strong><br/>
          <span>Source: <b>${alert.triggerSource || 'unknown'}</b></span><br/>
          <span>User: ${alert.triggeredByName || alert.triggeredBy || alert.userId || 'Unknown'}</span><br/>
          <span style="font-size:11px;color:#64748b">${timeStr}</span><br/>
          <a href="https://maps.google.com/?q=${coords.lat},${coords.lng}" target="_blank" rel="noreferrer" style="color:#2563eb;font-size:12px;">Open in Google Maps</a>
        </div>`
      );

      marker.on('click', () => {
        if (onSelectAlert) onSelectAlert(alert);
      });

      marker.addTo(layer);

      if (isSelected) {
        map.setView([coords.lat, coords.lng], 15, { animate: true });
        marker.openPopup();
      }
    });

    if (!selectedAlertId && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [alerts, selectedAlertId, onSelectAlert]);

  return (
    <div
      ref={mapContainerRef}
      className="leaflet-map-container"
      aria-label="Active SOS alerts map"
    />
  );
}
