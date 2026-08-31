"use client";

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

// Crear icono de Chincheta roja clásica estilo Google Maps
const redPinIcon = L.divIcon({
  html: `<div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: grab;">
    <svg width="34" height="46" viewBox="0 0 24 34" fill="none">
      <ellipse cx="12" cy="31" rx="6" ry="2.5" fill="rgba(0,0,0,0.35)" />
      <path d="M12 0C5.37258 0 0 5.37258 0 12C0 19.5 12 32 12 32C12 32 24 19.5 24 12C24 5.37258 18.6274 0 12 0Z" fill="#ef4444" stroke="#ffffff" stroke-width="1.8" />
      <circle cx="12" cy="11" r="4.5" fill="#ffffff" />
    </svg>
  </div>`,
  className: "custom-draggable-pin",
  iconSize: [34, 46],
  iconAnchor: [17, 44],
});

interface DraggableMapProps {
  lat: number;
  lng: number;
  zoom: number;
  onPositionChange: (newCoords: { lat: number; lng: number }) => void;
  onZoomChange?: (newZoom: number) => void;
}

// Subcomponente para sincronizar centro y eventos de arrastre
function MapSyncHandler({
  lat,
  lng,
  onPositionChange,
  onZoomChange,
}: {
  lat: number;
  lng: number;
  onPositionChange: (newCoords: { lat: number; lng: number }) => void;
  onZoomChange?: (newZoom: number) => void;
}) {
  const map = useMapEvents({
    click(e) {
      onPositionChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    zoomend() {
      if (onZoomChange) onZoomChange(map.getZoom());
    },
  });

  const prevCoordsRef = useRef({ lat, lng });
  useEffect(() => {
    if (
      Math.abs(prevCoordsRef.current.lat - lat) > 0.000001 ||
      Math.abs(prevCoordsRef.current.lng - lng) > 0.000001
    ) {
      prevCoordsRef.current = { lat, lng };
      map.panTo([lat, lng], { animate: true });
    }
  }, [lat, lng, map]);

  return null;
}

export default function DraggableSatelliteMap({
  lat,
  lng,
  zoom,
  onPositionChange,
  onZoomChange,
}: DraggableMapProps) {
  const markerRef = useRef<L.Marker>(null);

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const newPos = marker.getLatLng();
          onPositionChange({ lat: newPos.lat, lng: newPos.lng });
        }
      },
    }),
    [onPositionChange]
  );

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={zoom}
      style={{ width: "100%", height: "100%" }}
      preferCanvas={true}
    >
      <TileLayer
        url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
        attribution="Google Satellite"
        maxZoom={22}
      />

      <MapSyncHandler
        lat={lat}
        lng={lng}
        onPositionChange={onPositionChange}
        onZoomChange={onZoomChange}
      />

      <Marker
        draggable={true}
        eventHandlers={eventHandlers}
        position={[lat, lng]}
        ref={markerRef}
        icon={redPinIcon}
      />
    </MapContainer>
  );
}
