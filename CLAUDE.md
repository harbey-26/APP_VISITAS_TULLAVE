# CLAUDE.md — APP Visitas TuLlave

Guía de contexto para continuar el desarrollo de este proyecto en futuras sesiones.

---

## Descripción del proyecto

Aplicación de rastreo de visitas inmobiliarias para **TuLlave Inmobiliaria**.

- **Frontend:** React 18 + Vite + Tailwind CSS
- **Backend:** Express + Prisma ORM
- **Base de datos:** PostgreSQL en producción (Railway), SQLite en desarrollo local
- **Mobile:** APK Android compilado con Capacitor v8 via GitHub Actions
- **Mapas:** Google Maps (`@react-google-maps/api`)
- **Íconos:** Lucide React

---

## Arquitectura

```
APP_VISITAS_TULLAVE/
├── server.js                   # Servidor Express (backend)
├── src/
│   ├── App.jsx                 # Rutas React + ProtectedRoute + AdminRoute
│   ├── config.js               # API_URL (env VITE_API_URL o vacío para proxy)
│   ├── pages/
│   │   ├── Agenda.jsx          # Vista de agenda para agentes
│   │   ├── Dashboard.jsx       # Panel de estadísticas (admin)
│   │   ├── Login.jsx           # Autenticación
│   │   ├── Properties.jsx      # CRUD inmuebles (admin)
│   │   ├── Tracking.jsx        # Rastreo de agentes en tiempo real (admin)
│   │   ├── Users.jsx           # CRUD usuarios (admin)
│   │   └── VisitExecution.jsx  # Ejecución de visita (agente)
│   ├── components/layout/
│   │   └── Layout.jsx          # Sidebar + nav móvil + GPS + WakeLock
│   ├── controllers/            # Lógica de negocio Express
│   ├── routes/                 # Endpoints de la API
│   ├── context/
│   │   ├── AuthContext.jsx     # Estado de autenticación global
│   │   └── ToastContext.jsx    # Notificaciones toast
│   ├── middleware/
│   │   └── auth.middleware.js  # Validación JWT
│   └── utils/
│       ├── auth.js             # Helpers de bcrypt / JWT
│       ├── geo.js              # Abstracción GPS: nativo (APK) vs web
│       └── visitTypes.js       # Constantes de tipos de visita
├── prisma/
│   ├── schema.prisma           # Schema SQLite (desarrollo local)
│   ├── schema.pg.prisma        # Schema PostgreSQL (producción Railway)
│   └── seed.js                 # Datos iniciales
├── capacitor.config.ts         # Config APK — apunta a Railway
├── .github/workflows/
│   └── build-apk.yml           # Pipeline CI para compilar APK Android
└── vite.config.js              # Vite — incluye externals para Capacitor
```

---

## Despliegue

### Web (Railway)
- URL: `https://tu-llave-visitas-e66b.up.railway.app`
- El `start` script en `package.json` corre `prisma db push` + seed + servidor
- Schema activo en producción: `prisma/schema.pg.prisma`
- Para desplegar: `git push origin main` — Railway hace auto-deploy

### APK Android (GitHub Actions)
- Se compila **solo cuando cambian archivos nativos** (`capacitor.config.ts`,
  `package.json`, `package-lock.json`, íconos en `assets/ic_*.png`, o el propio
  workflow). Los cambios en `src/`, `server.js`, `prisma/`, `docs/` NO regeneran
  APK — el WebView ya los toma al recargar la app.
- También se puede lanzar manualmente: **GitHub → Actions → Build Android APK → Run workflow**
- El APK generado se descarga en: **Actions → run más reciente → Artifacts → VisitTrack-APK**
- El APK carga la misma URL de Railway (WebView nativo), mismo backend y BD
- Duración del build: ~5-8 minutos
- **Aviso de update al usuario:** al subir `version` en `package.json`, el banner
  de [`UpdateBanner.jsx`](src/components/UpdateBanner.jsx) aparece automáticamente
  en el APK con un enlace de descarga. El backend expone la versión vigente en
  `/api/app/version`.

---

## Roles de usuario

| Rol | Acceso |
|-----|--------|
| `AGENT` | Solo `/agenda` y `/visit/:id` |
| `ADMIN` | Todo: dashboard, inmuebles, usuarios, rastreo |

---

## Modelos de base de datos

```prisma
User      — id, email, password, name, role (AGENT/ADMIN),
            lastLat, lastLng, lastSeenAt, connectedSince
Property  — id, address, client, lat, lng
Visit     — id, userId, propertyId, scheduledStart, estimatedDuration,
            status (PENDING/IN_PROGRESS/COMPLETED/MISSED),
            type (SHOWING/APPRAISAL/INSPECTION),
            actualStart, actualEnd, checkInLat/Lng, checkOutLat/Lng,
            notes, outcome, clientName, clientPhone
VisitImage — id, visitId, url
```

---

## API endpoints clave

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/auth/login` | No | Login, devuelve JWT |
| POST | `/api/auth/register` | No | Registrar usuario |
| PATCH | `/api/users/location` | JWT | Actualizar GPS del agente |
| GET | `/api/users/locations` | JWT+Admin | Listar ubicaciones de agentes |
| GET/POST | `/api/properties` | JWT | Inmuebles |
| GET/POST | `/api/visits` | JWT | Visitas |
| GET | `/api/visits/stats` | JWT+Admin | Estadísticas globales del período |
| GET | `/api/visits/stats/agents` | JWT+Admin | Estadísticas por agente |
| PATCH | `/api/visits/:id/start` | JWT | Iniciar visita |
| PATCH | `/api/visits/:id/finish` | JWT | Finalizar visita |
| PATCH | `/api/visits/:id/missed` | JWT | Marcar como no atendida |
| PATCH | `/api/visits/:id/reassign` | JWT+Admin | Reasignar a otro agente |
| GET/POST | `/api/visits/:id/images` | JWT | Fotos de visita |
| DELETE | `/api/visits/:id/images/:imgId` | JWT | Eliminar foto |
| GET/POST | `/api/broadcasts` | JWT | Comunicados admin→agente |

---

## GPS y rastreo

- **Web (Chrome Android):** `setInterval` cada 60 s + Wake Lock API + `visibilitychange`
- **APK nativo:** `@capacitor-community/background-geolocation` con Android Foreground Service
- La detección se hace en runtime con `Capacitor.isNativePlatform()` en `src/utils/geo.js`
- El campo `connectedSince` se actualiza en cada login; `lastSeenAt` en cada ping GPS

---

## Variables de entorno

| Variable | Dónde | Para qué |
|----------|-------|---------|
| `DATABASE_URL` | Railway (backend) | Conexión PostgreSQL |
| `JWT_SECRET` | Railway (backend) | Firma de tokens |
| `VITE_GOOGLE_MAPS_API_KEY` | `.env` local + GitHub Secret | Google Maps |
| `VITE_API_URL` | `.env` local (vacío = proxy) | URL del backend |

Secreto en GitHub Actions: `VITE_GOOGLE_MAPS_API_KEY`

---

## Comandos útiles

```bash
# Desarrollo local
npm run dev          # Inicia Vite (frontend en :5173)
node server.js       # Inicia Express (backend en :3000)
npx prisma studio    # UI de base de datos

# Producción / build
npm run build        # Compila frontend → dist/

# Base de datos
npx prisma db push --schema prisma/schema.prisma      # Aplica cambios en local (SQLite)
npx prisma db push --schema prisma/schema.pg.prisma   # Aplica cambios en Railway (PG)
```

---

## Convenciones de código

- **Frontend:** componentes funcionales con hooks, Tailwind para estilos
- **Color de marca:** `brand-600` (configurado en `tailwind.config.js`)
- **Backend:** controladores separados por entidad en `src/controllers/`
- **Validación:** Zod en controladores del backend
- **Errores GPS:** siempre silenciosos (`.catch(() => {})`) — no interrumpen al usuario
- **Esquemas Prisma:** modificar SIEMPRE ambos (`schema.prisma` + `schema.pg.prisma`)

---

## Funcionalidades implementadas

### Agenda (`Agenda.jsx`)
- Vista lista agrupada por bloques horarios (Mañana/Tarde/Noche)
- **Vista mapa** con toggle Lista/Mapa — marcadores de color por tipo de visita; al tocar un marcador aparece una card overlay (fuera del iframe de Maps) con botón "Abrir visita"
- Filtro por rango de fechas
- Crear visita con validación de conflictos horarios
- Reasignar agente (admin), marcar no atendida, eliminar con contraseña

### Dashboard (`Dashboard.jsx`)
- **Pestaña General:** 4 métricas (total, completadas, duración prom., conversión %), barras por tipo, tabla paginada, exportar CSV y PDF
- **Pestaña Por Agente:** ranking de agentes con total, completadas (barra %), no atendidas, conversión (semáforo) y duración promedio; medallas 🥇🥈🥉

### Otras páginas
- `VisitExecution.jsx` — iniciar/finalizar visita con GPS + geofencing, fotos, cronómetro
- `Tracking.jsx` — mapa en tiempo real de agentes con clustering y comunicados
- `Users.jsx` / `Properties.jsx` — CRUD completo

---

## Notas importantes

- `android/` e `ios/` están en `.gitignore` — se generan en CI, nunca se commitean
- `dist/` está en `.gitignore` — Railway corre el build en el servidor
- El `postinstall` en `package.json` corre `prisma generate + build` para Railway;
  el workflow de CI usa `npm ci --ignore-scripts` para evitarlo
- Los paquetes `@capacitor/geolocation` y `@capacitor-community/background-geolocation`
  están marcados como `external` en `vite.config.js` — el runtime nativo los resuelve
- La label del step en el workflow dice "Setup Java 17" pero usa Java 21 (Capacitor v8 lo requiere)
- **Google Maps:** todos los `useJsApiLoader` deben usar `id: 'google-map-script'` — si falta ese id en algún componente, al navegar entre páginas con mapa se lanza una excepción que el ErrorBoundary captura como "error inesperado"
