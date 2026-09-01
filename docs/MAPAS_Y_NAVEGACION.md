# 🗺️ Guía de Mapas, Navegación y Botón Casa

Esta guía describe el funcionamiento de los mapas en Plan Algodón, los proveedores de teselas sin API key, la optimización móvil para iOS Safari y la funcionalidad del Botón Casa.

---

## 1. Botón Casa (Vista de Inicio Memorizable)

Ubicado en la cabecera superior y en la botonera flotante del mapa, permite definir una posición geográfica y nivel de zoom favoritos.

### Funcionamiento

| Acción | Tiempo | Comportamiento |
| :--- | :--- | :--- |
| **Toque Corto (Tap / Click)** | < 600 ms | Vuela suavemente el mapa (`map.flyTo`) a la vista guardada con su nivel de zoom exacto. Si el técnico está en vista Lista o Mi Día, cambia automáticamente a la vista Mapa. |
| **Mantener Presionado** | 5 segundos continuos | **Guarda la vista actual.** Durante los 5 segundos se visualiza una barra de progreso que se llena y una cuenta regresiva (`5s... 4s... 3s...`). Al completarse, vibra el teléfono y guarda latitud, longitud y zoom tanto en `localStorage` como en la base de datos de usuario (`/api/users/map-state`). |
| **Soltar Antes de Tiempo** | Entre 600ms y 5s | Cancela el guardado de forma segura notificando que se requieren los 5 segundos completos para evitar sobreescrituras accidentales. |

> [!NOTE]
> La interfaz del botón y sus notificaciones utilizan exclusivamente **iconos vectoriales SVG limpios**, sin ningún tipo de emojis.

---

## 2. Proveedores de Capas de Mapa (100% Libres de API Key)

Para evitar restricciones de cuota, marcas de agua o peticiones de API Key (como las introducidas recientemente por CartoDB), el sistema utiliza proveedores abiertos de alta calidad:

1. **Modo Oscuro (Esri Canvas)**:
   - Proveedor: *ESRI ArcGIS World Dark Gray Base*.
   - URL: `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`
   - Totalmente gratuito, sin clave API, tono oscuro minimalista de alto contraste diseñado específicamente para resaltar líneas de fibra y CTOs de colores.
2. **Modo Oscuro Contraste**:
   - Capa de calles Google combinada con un filtro CSS nocturno invertido (`.dark-tile-filter`).
   - Permite máxima nitidez en nombres de calles y portales hasta el nivel de zoom 21 sin costes de terceros.
3. **Google Normal**: Capa de calles tradicional.
4. **Google Satélite**: Fotografía aérea de alta resolución.
5. **Google Híbrido**: Satélite con nombres de calles y carreteras sobreimpresas.
6. **OpenStreetMap**: Capa comunitaria estándar.

---

## 3. Inmovilización del Mapa en iOS / iPhone

En navegadores WebKit (Safari en iPhone e iPad) solía presentarse un efecto de desbordamiento elástico vertical al arrastrar el mapa.

Se aplicaron las siguientes soluciones a nivel de maquetación:
- **Unidades de Viewport Dinámicas**: Uso estricto de `height: 100dvh` y `max-height: 100dvh` para adaptarse a la barra de navegación retráctil de iOS.
- **Anulación de Rebote**: Regla `overscroll-behavior: none` en `html, body, #__next, .map-container`.
- **Fijación de Puntero**: `touch-action: none` sobre el mapa mientras está activo, permitiendo paneo y zoom con dos dedos sin mover el marco de la página web.

---

## 4. Geolocalización y Rastreo en Tiempo Real

- **Pin de Ubicación GPS**: Dibuja un círculo azul con radio de precisión sobre la posición del técnico.
- **GPS Continuo**: Envía coordenadas en tiempo real al servidor (`/api/tech-locations`) para que los gestores y administradores puedan monitorizar las posiciones de las cuadrillas en el panel de control (`/admin/tech-map`).
