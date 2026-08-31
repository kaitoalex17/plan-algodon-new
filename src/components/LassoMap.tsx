"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polygon, useMapEvents } from "react-leaflet";
import L from "leaflet";

type CTO = {
  id: string;
  num: string;
  lat: number;
  lng: number;
  status: string;
  assignedTo?: { id: string; name: string; color?: string | null } | null;
};

interface LassoMapProps {
  ctos: CTO[];
  selectedCtoIds: string[];
  isDrawingMode: boolean;
  onPolygonComplete: (coords: [number, number][]) => void;
  onToggleCto: (id: string) => void;
  polygonCoords: [number, number][];
}

// Subcomponente para gestionar el dibujo de lazo con mouse y touch (dedo)
function LassoDrawHandler({
  isDrawingMode,
  onPolygonComplete,
}: {
  isDrawingMode: boolean;
  onPolygonComplete: (coords: [number, number][]) => void;
}) {
  const map = useMapEvents({});
  const pointsRef = useRef<L.LatLng[]>([]);
  const isDraggingRef = useRef(false);
  const polylineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;

    if (isDrawingMode) {
      // Desactivar paneo y zoom con arrastre para permitir dibujar libremente
      map.dragging.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();

      const container = map.getContainer();
      container.style.cursor = "crosshair";

      const handleMouseDown = (e: MouseEvent | TouchEvent) => {
        isDraggingRef.current = true;
        pointsRef.current = [];

        let clientX = 0;
        let clientY = 0;
        if ("touches" in e && e.touches.length > 0) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        } else if ("clientX" in e) {
          clientX = e.clientX;
          clientY = e.clientY;
        }

        const point = map.mouseEventToLatLng({
          clientX,
          clientY,
        } as any);

        pointsRef.current.push(point);

        if (polylineRef.current) {
          map.removeLayer(polylineRef.current);
        }

        polylineRef.current = L.polyline([point], {
          color: "#FF7900",
          weight: 3,
          dashArray: "4, 4",
          opacity: 0.9,
        }).addTo(map);
      };

      const handleMouseMove = (e: MouseEvent | TouchEvent) => {
        if (!isDraggingRef.current) return;

        let clientX = 0;
        let clientY = 0;
        if ("touches" in e && e.touches.length > 0) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        } else if ("clientX" in e) {
          clientX = e.clientX;
          clientY = e.clientY;
        }

        const point = map.mouseEventToLatLng({
          clientX,
          clientY,
        } as any);

        // Filtrar puntos muy cercanos para optimizar el polígono
        const last = pointsRef.current[pointsRef.current.length - 1];
        if (!last || point.distanceTo(last) > 2) {
          pointsRef.current.push(point);
          if (polylineRef.current) {
            polylineRef.current.setLatLngs(pointsRef.current);
          }
        }
      };

      const handleMouseUp = () => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;

        if (polylineRef.current) {
          map.removeLayer(polylineRef.current);
          polylineRef.current = null;
        }

        if (pointsRef.current.length >= 3) {
          const coords: [number, number][] = pointsRef.current.map((p) => [p.lat, p.lng]);
          onPolygonComplete(coords);
        }
        pointsRef.current = [];
      };

      container.addEventListener("mousedown", handleMouseDown);
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);

      container.addEventListener("touchstart", handleMouseDown, { passive: false });
      window.addEventListener("touchmove", handleMouseMove, { passive: false });
      window.addEventListener("touchend", handleMouseUp);

      return () => {
        container.removeEventListener("mousedown", handleMouseDown);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);

        container.removeEventListener("touchstart", handleMouseDown);
        window.removeEventListener("touchmove", handleMouseMove);
        window.removeEventListener("touchend", handleMouseUp);

        if (polylineRef.current) {
          map.removeLayer(polylineRef.current);
        }
      };
    } else {
      // Restaurar controles normales de navegación de mapa
      map.dragging.enable();
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
      map.scrollWheelZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
      map.getContainer().style.cursor = "";
    }
  }, [isDrawingMode, map, onPolygonComplete]);

  return null;
}

export default function LassoMap({
  ctos,
  selectedCtoIds,
  isDrawingMode,
  onPolygonComplete,
  onToggleCto,
  polygonCoords,
}: LassoMapProps) {
  // Centro por defecto (España o promedio de CTOs)
  const defaultCenter: [number, number] = ctos.length > 0 ? [ctos[0].lat, ctos[0].lng] : [40.4168, -3.7038];

  return (
    <MapContainer
      center={defaultCenter}
      zoom={14}
      style={{ height: "100%", width: "100%" }}
      preferCanvas={true}
    >
      <TileLayer
        url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
        attribution="Google Maps"
        maxZoom={21}
      />

      <LassoDrawHandler
        isDrawingMode={isDrawingMode}
        onPolygonComplete={onPolygonComplete}
      />

      {/* Mostrar el polígono del lazo dibujado si existe */}
      {polygonCoords.length >= 3 && (
        <Polygon
          positions={polygonCoords}
          pathOptions={{
            color: "#FF7900",
            weight: 2,
            fillColor: "#FF7900",
            fillOpacity: 0.25,
            dashArray: "6, 6",
          }}
        />
      )}

      {/* Marcadores de CTOs */}
      {ctos.map((cto) => {
        const isSelected = selectedCtoIds.includes(cto.id);
        const color = cto.assignedTo?.color || "#3b82f6";

        // Generar icono personalizado
        const icon = L.divIcon({
          html: `<div style="
            width: ${isSelected ? "22px" : "14px"};
            height: ${isSelected ? "22px" : "14px"};
            border-radius: 50%;
            background-color: ${color};
            border: ${isSelected ? "3px solid #ffffff" : "1.5px solid #ffffff"};
            box-shadow: ${isSelected ? "0 0 12px 5px #FF7900" : "0 2px 5px rgba(0,0,0,0.4)"};
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            ${isSelected ? '<div style="width:6px;height:6px;border-radius:50%;background:#ffffff;"></div>' : ""}
          </div>`,
          className: "lasso-cto-pin",
          iconSize: [isSelected ? 24 : 16, isSelected ? 24 : 16],
          iconAnchor: [isSelected ? 12 : 8, isSelected ? 12 : 8],
        });

        return (
          <Marker
            key={cto.id}
            position={[cto.lat, cto.lng]}
            icon={icon}
            eventHandlers={{
              click: () => {
                if (!isDrawingMode) {
                  onToggleCto(cto.id);
                }
              },
            }}
          />
        );
      })}
    </MapContainer>
  );
}
