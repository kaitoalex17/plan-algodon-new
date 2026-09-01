# 🎨 Sistema de Temas y Personalización Visual

Plan Algodón incorpora un completo sistema de personalización visual para que técnicos y auditores adapten el contraste de la interfaz a las condiciones de iluminación en exteriores y a sus preferencias personales.

---

## 1. Organización de los 15 Temas de Color

Para garantizar una experiencia visual ordenada y evitar desbordamientos en pantallas móviles estrechas (360px - 400px), los temas se organizan en **dos bloques temáticos**:

### A. Temas Estándar (10 temas)
Diseñados con alto contraste sobre fondo oscuro institucional:
- **Naranja** (`orange`): Color corporativo predeterminado (`#FF7900`).
- **Azul** (`blue`): Azul cobalto (`#2563eb`).
- **Verde** (`green`): Verde esmeralda (`#10b981`).
- **Morado** (`purple`): Violeta profesional (`#8b5cf6`).
- **Indigo** (`indigo`): Azul índigo profundo (`#4f46e5`).
- **Rosa** (`rose`): Magenta vivo (`#e11d48`).
- **Teal** (`teal`): Verde azulado (`#0d9488`).
- **Ámbar** (`amber`): Ámbar cálido (`#d97706`).
- **Pizarra** (`slate`): Gris pizarra neutro (`#475569`).
- **Oscuro** (`dark`): Modo noche estándar (`#0f172a`).

### B. Temas Modo Oscuro Puro (5 temas)
Diseñados con fondos ultra-negros OLED (`#050811` a `#15080c`) con acentos de color neón:
- **Cyan** (`dark-cyan`): Cyan neón (`#06b6d4`).
- **Verde** (`dark-emerald`): Verde tecnológico (`#10b981`).
- **Violeta** (`dark-purple`): Púrpura eléctrico (`#a855f7`).
- **Rojo** (`dark-crimson`): Carmesí de alerta (`#f43f5e`).
- **Oro** (`dark-amber`): Dorado de alta visibilidad (`#fbbf24`).

---

## 2. Cuadrícula Responsiva y Anti-Desbordamiento

El selector de temas implementa la siguiente regla CSS en [ClientPageWrapper.tsx](../src/app/ClientPageWrapper.tsx):

```tsx
display: "grid",
gridTemplateColumns: "repeat(auto-fill, minmax(68px, 1fr))",
gap: "6px"
```

### Ventajas de esta distribución:
1. **Zero Overflow**: En cualquier tamaño de pantalla (desde un iPhone SE de 320px hasta una tablet de 12"), los botones nunca sobresalen del modal ni fuerzan barras de scroll horizontal.
2. **Textos Cortos y Legibles**: Se han simplificado las etiquetas internas para evitar saltos de línea antiestéticos.
3. **Persistencia en Base de Datos**: Cada cambio de tema se guarda de forma instantánea en `localStorage` y en la columna `theme` de la tabla `User` en PostgreSQL mediante `/api/users/map-state`.

---

## 3. Ajustes de Marcadores de CTOs

En el mismo panel de perfil, cada técnico puede configurar de forma individual:
- **Forma del Marcador**: Círculo, Triángulo, Cuadrado, Rombo o Estrella.
- **Tamaño del Marcador**: Selector de 4px a 12px.
- **Patrones de Relleno**: Líneas diagonales, cuadrícula o relleno sólido para distinguir cajas correctas de cajas con fallo o pendiente.
