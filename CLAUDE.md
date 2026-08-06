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
│   │   ├── Liquidaciones.jsx   # Liquidación inicial + cuenta por cobrar (L1)
│   │   ├── Login.jsx           # Autenticación
│   │   ├── Properties.jsx      # CRUD inmuebles (admin)
│   │   ├── Tracking.jsx        # Rastreo de agentes en tiempo real (admin)
│   │   ├── Users.jsx           # CRUD usuarios (admin)
│   │   └── VisitExecution.jsx  # Ejecución de visita (agente)
│   ├── components/
│   │   ├── layout/Layout.jsx       # Sidebar + nav móvil + GPS + WakeLock
│   │   ├── AddressAutocomplete.jsx # Input de dirección con Google Places (compartido)
│   │   └── SlideToConfirm.jsx      # "Desliza para confirmar" (acciones irreversibles)
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
│       ├── mapsLoader.js       # Opciones únicas de useJsApiLoader (libs ['places'])
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
User      — id, email, password, name, phone (celular del agente — sale en
            el mensaje de confirmación al cliente), role (AGENT/ADMIN),
            tokenVersion (revocación de sesiones: cambiar la contraseña lo
            incrementa y el middleware rechaza los JWT con versión vieja —
            desloguea todos los dispositivos del usuario al instante),
            lastLat, lastLng, lastSeenAt, connectedSince
Property  — id, address, client, lat, lng
Visit     — id, userId, propertyId, scheduledStart, estimatedDuration,
            status (PENDING/IN_PROGRESS/COMPLETED/MISSED/CANCELLED),
            cancelReason (motivo obligatorio al cancelar — llega al admin),
            type (SHOWING/APPRAISAL/INSPECTION),
            modality (ON_SITE/PHONE) — PHONE = captación por llamada, sin GPS,
            actualStart, actualEnd, checkInLat/Lng, checkOutLat/Lng,
            notes, outcome, clientName, clientPhone, clientEmail,
            confirmedAt — clientName/clientPhone OBLIGATORIOS al crear;
            clientEmail opcional (si se llena, se invita al cliente al evento
            de Google Calendar con sendUpdates=all → email de confirmación).
            confirmedAt lo marca el botón de WhatsApp "Confirmar cita"
VisitImage — id, visitId, url
Contract  — id, type (ADMINISTRACION/ARRENDAMIENTO),
            status (DRAFT/REOPENED/PENDING_APPROVAL/APPROVED/REJECTED/SENT),
            data (String JSON — campos del formulario; SQLite no soporta Json
            en Prisma 5), userId (agente), visitId?, propertyId?,
            shareToken (link público, fase 2), reviewNote/reviewedBy/reviewedAt
            (visto bueno del admin), sentAt
Liquidacion — id, status (DRAFT/REOPENED/PENDING_APPROVAL/APPROVED/REJECTED/PAID),
            data (String JSON: { origen, config, totales }), contractId (@unique —
            1:1 con el contrato ARRENDAMIENTO), userId, shareToken, reviewNote/
            reviewedBy/reviewedAt, sentAt (compartir NO es estado, solo flag),
            paidAt. `origen` = snapshot del contrato (bloqueado en UI); `totales`
            se congela al aprobar (fuente del PDF definitivo)
LiquidacionPago — id, liquidacionId, valor (COP sin centavos), fecha, nota,
            registradoPor (auditoría) — tabla propia, no JSON
FichaIncremento — id, contractId? (@unique — null si vino de CSV/manual),
            userId? (agente responsable), codigoWasi, datos del arrendatario,
            direccion, fechaInicioContrato ("YYYY-MM-DD"), canonActual (canon
            VIGENTE, se actualiza al aplicar), tipoIndice (IPC/IPC_PLUS/FIJO),
            puntosAdicionales, pctFijo, activa (false = contrato terminado)
Incremento — id, fichaId, periodo (año), fechaEfectiva, canonAnterior,
            indicePct?, nuevoCanon?, status (PENDIENTE/ENVIADA/APLICADA/ANULADA),
            data (snapshot JSON de la carta congelado al enviar), campos de
            trazabilidad del envío (cartaEnviadaAt, enviadaPor+Nombre, enviadaA,
            shareToken, emailedAt), aplicadoAt/Por, anuladoMotivo.
            @@unique(fichaId, periodo) — una tarea por aniversario
IndiceAnual — anio (@unique, año de APLICACIÓN), pct (IPC %), fuente
Solicitud  — id, radicado (@unique "SOL-2026-0001", consecutivo por año), tipo
            (clave de SolicitudTipo), estado (RECIBIDA/EN_REVISION/EN_GESTION/
            PENDIENTE_TERCERO/FINALIZADA/ARCHIVADA), prioridad, medioIngreso,
            asunto, descripcion, datos del solicitante (nombre/tipo/tel/email —
            propietario y arrendatario NO son entidades), propertyId?,
            contractId?, creadaPor, responsableId? (bandeja), fechaVencimiento?
            ("YYYY-MM-DD"), data (JSON del tipo: reparacion / servicioPublico /
            derechoPeticion / terminacion / respuesta / alertasEnviadas /
            reportePago (#55) / grupo (#57: radicados de la radicación múltiple)),
            shareToken?, emailedAt?, finalizadaAt? (métrica de respuesta)
SolicitudActuacion — línea de tiempo INMUTABLE (sin update/delete): tipo
            (CREACION/ESTADO/ASIGNACION/NOTA/ADJUNTO/AUTOMATIZACION/RESPUESTA/
            ALERTA), descripcion, userId? (null = sistema/cron), meta JSON
SolicitudAdjunto — nombre, mimeType, size, categoria (FOTO/FOTO_ANTES/
            FOTO_DESPUES/FACTURA/COTIZACION/ACTA/CORREO/PDF/COMPROBANTE/
            VIDEO/OTRO), dataUrl (base64 en BD, como las fotos de visita —
            máx. 5 MB/archivo; videos #58: máx. 25 MB y 1 minuto),
            paraCliente (#60: visible en el portal del solicitante — lo marca
            el equipo con el globo 🌐; los archivos subidos por el propio
            cliente y los referenciados en la respuesta nacen/quedan en true)
SolicitudTipo — clave (@unique), label, activo, orden — administrable; el seed
            siembra los 11 del epic + "Reporte de pago" (#55) (idempotente,
            corre en cada deploy)
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
| PATCH | `/api/visits/:id` | JWT | Editar visita (dueño/admin): fecha, duración, tipo, modalidad, cliente, notas, agente. Solo PENDING/IN_PROGRESS. Re-valida conflictos + re-sync Calendar |
| PUT | `/api/properties/:id` | JWT | Editar inmueble (NO es PATCH). Geocodifica si lat/lng son null o defaults |
| GET | `/api/visits/stats` | JWT+Admin | Estadísticas globales del período |
| GET | `/api/visits/stats/agents` | JWT+Admin | Estadísticas por agente |
| PATCH | `/api/visits/:id/start` | JWT | Iniciar visita. **Bloquea (409)** si el agente tiene otra visita IN_PROGRESS o una PENDING programada antes de esta (debe finalizarla / marcarla no atendida / cancelarla); devuelve `openVisitId`/`blockingVisitId` |
| PATCH | `/api/visits/:id/finish` | JWT | Finalizar visita. Geofencing obligatorio para agentes; **solo el ADMIN puede finalizar sin estar en el sitio** |
| PATCH | `/api/visits/:id/complete-call` | JWT | Registrar captación por llamada (modalidad PHONE): PENDING→COMPLETED en un paso, sin GPS ni geofencing. Captura resultado + notas |
| PATCH | `/api/visits/:id/missed` | JWT | Marcar como no atendida. Si lo hace un agente, notifica a los admins (FCM) |
| PATCH | `/api/visits/:id/cancel` | JWT | Cancelar visita PENDING con `{reason}` obligatorio → CANCELLED. Borra el evento de Calendar. Agente cancela → notifica admins; admin cancela visita ajena → notifica al agente |
| PATCH | `/api/visits/:id/reassign` | JWT+Admin | Reasignar a otro agente |
| POST | `/api/visits/cleanup-pending` | JWT+Admin | **Depurar en bloque** las PENDING programadas antes de `{before}` (00:00 Bogotá) → `{action}` MISSED o CANCELLED (+`reason`). `dryRun:true` solo cuenta. Sin notificaciones por visita ni Calendar. Botón "Depurar vencidas" en Agenda (admin) |
| GET/POST | `/api/visits/:id/images` | JWT | Fotos de visita |
| DELETE | `/api/visits/:id/images/:imgId` | JWT | Eliminar foto |
| GET/POST | `/api/broadcasts` | JWT | Comunicados admin→agente |
| GET/POST | `/api/contracts` | JWT | Contratos (agente ve los suyos; admin todos) |
| PATCH | `/api/contracts/:id` | JWT | Editar datos (solo DRAFT/REJECTED, dueño/admin) |
| PATCH | `/api/contracts/:id/submit` | JWT | Enviar a revisión (valida formulario completo) |
| PATCH | `/api/contracts/:id/review` | JWT+Admin | Aprobar o devolver (`{decision, note}`) |
| PATCH | `/api/contracts/:id/reopen` | JWT | Reabrir un APROBADO para corregir → REOPENED (dueño/admin; SENT bloqueado) |
| POST | `/api/contracts/:id/share` | JWT | Genera shareToken, marca SENT, devuelve `publicUrl` (WhatsApp) |
| POST | `/api/contracts/:id/email` | JWT | Envía el PDF adjunto al correo del cliente vía Gmail API. Anti-duplicado: 409 si ya se envió hace <1 h (`emailedAt`, reclamo atómico) |
| GET | `/api/contracts/public/:token/pdf` | **No** | PDF público para el cliente final (solo contratos SENT) |
| DELETE | `/api/contracts/:id` | JWT | Eliminar (dueño solo editables; admin cualquiera) |
| GET/POST | `/api/liquidaciones` | JWT | Liquidaciones (agente las suyas; admin todas). POST crea DRAFT desde `{contractId}` (ARRENDAMIENTO aprobado, 409 si ya existe) |
| PATCH | `/api/liquidaciones/:id` | JWT | Editar SOLO `config` (estados editables; admin también en PENDING_APPROVAL). `origen` nunca se acepta del cliente. Las **fechas del cobro solo las cambia el admin**; `diasCobrados` se recalcula SIEMPRE server-side desde las fechas |
| POST | `/api/liquidaciones/:id/solicitar-fechas` | JWT | El agente propone otro período `{fechaInicialCobro, fechaFinalCobro, motivo}` → `data.solicitudFechas` PENDIENTE + notifica admins. El admin la aplica editando las fechas (queda ATENDIDA y se avisa al agente) |
| POST | `/api/liquidaciones/:id/sync-contrato` | JWT | Re-importar el snapshot del contrato (solo editable) |
| PATCH | `/api/liquidaciones/:id/submit` | JWT | Enviar a revisión (valida config) → notifica admins |
| PATCH | `/api/liquidaciones/:id/review` | JWT+Admin | Aprobar (congela `data.totales`) o devolver con nota |
| PATCH | `/api/liquidaciones/:id/reopen` | JWT | Reabrir APROBADA (solo sin pagos y sin enviar) |
| POST | `/api/liquidaciones/:id/pagos` | JWT | Registrar pago (solo APPROVED); saldo $0 → PAID. Notifica a la contraparte |
| DELETE | `/api/liquidaciones/:id/pagos/:pagoId` | JWT+Admin | Corregir un pago; si revive el saldo, PAID → APPROVED |
| POST | `/api/liquidaciones/:id/share` | JWT | Link público (WhatsApp); marca `sentAt` sin cambiar status |
| POST | `/api/liquidaciones/:id/email` | JWT | PDF adjunto al correo del arrendatario (Gmail API). Anti-duplicado 1 h igual que contratos |
| GET | `/api/liquidaciones/public/:token/pdf` | **No** | PDF público para el arrendatario (solo compartidas) |
| DELETE | `/api/liquidaciones/:id` | JWT | Eliminar (dueño solo editables; admin cualquiera; cascade borra pagos) |
| GET | `/api/incrementos/fichas` | JWT | Fichas de incremento (admin todas; agente las suyas) con próximo aniversario e historial |
| POST | `/api/incrementos/fichas` | JWT+Admin | Alta manual de ficha |
| PATCH/DELETE | `/api/incrementos/fichas/:id` | JWT+Admin | Editar / eliminar. Para sacar del radar sin perder historial: PATCH `{activa:false}` |
| POST | `/api/incrementos/fichas/backfill` | JWT+Admin | Migración inicial: fichas para contratos ARRENDAMIENTO aprobados sin ficha |
| POST | `/api/incrementos/fichas/importar` | JWT+Admin | Carga masiva `{filas:[…]}` (el frontend parsea el CSV); deduplica por código Wasi |
| GET / PUT | `/api/incrementos/indices(/:anio)` | JWT (PUT admin) | IPC por año de aplicación |
| POST | `/api/incrementos/detectar` | JWT+Admin | Corre la detección de aniversarios ahora (lo mismo del cron) |
| POST | `/api/incrementos/procesar-mes` | JWT+Admin | Procesamiento masivo: detecta el período, recalcula pendientes sin índice, resume `{detectados, listos, sinIndice, incompletos}` |
| GET | `/api/incrementos` | JWT | Incrementos (admin todos; agente los suyos) con semáforo/grupo/snapshot |
| PATCH | `/api/incrementos/:id` | JWT+Admin | Ajustar % o fecha efectiva (solo PENDIENTE) |
| POST | `/api/incrementos/:id/share` | JWT | Link público de la carta (WhatsApp). SÍ marca ENVIADA + congela snapshot |
| POST | `/api/incrementos/:id/email` | JWT | Carta PDF al correo del arrendatario (Gmail API, anti-duplicado 1 h) |
| GET | `/api/incrementos/public/:token/pdf` | **No** | PDF público de la carta (solo enviadas) |
| PATCH | `/api/incrementos/:id/aplicar` | JWT+Admin | Aplica el nuevo canon a la ficha (transacción) y cierra el ciclo → APLICADA |
| PATCH | `/api/incrementos/:id/anular` | JWT+Admin | Anular con `{motivo}` obligatorio |
| GET/POST | `/api/solicitudes` | JWT | Expedientes (admin todos; usuario los suyos: asignados + radicados). POST radica con radicado automático; tipo DERECHOS_DE_PETICION calcula el vencimiento legal (días hábiles, `dpTipo`). **#57:** `tipos: [...]` (máx. 5) crea un expediente por tipo, vinculados en `data.grupo` — `tipo` (singular) sigue funcionando |
| GET/POST/PATCH | `/api/solicitudes/tipos(/:id)` | JWT (escribir admin) | Tipos administrables |
| GET | `/api/solicitudes/stats` | JWT | KPIs del dashboard: abiertas, cerradas, vencidas, promedio de respuesta, por tipo/estado, tendencia |
| GET/PATCH/DELETE | `/api/solicitudes/:id` | JWT | Detalle con timeline / editar base / eliminar (admin, o creador solo RECIBIDA) |
| PATCH | `/api/solicitudes/:id/estado` | JWT | Transición validada por la máquina de estados (no salta pasos; permite retroceder y reabrir) → actuación + FCM |
| PATCH | `/api/solicitudes/:id/asignar` | JWT+Admin | Asignar responsable → FCM |
| POST | `/api/solicitudes/:id/notas` | JWT | Nota manual en la línea de tiempo |
| POST | `/api/solicitudes/:id/adjuntos` | JWT | Subida múltiple `{adjuntos:[…]}` (máx. 5 MB c/u; videos #58: MP4/MOV, máx. 25 MB y 1 min — duración validada server-side) → actuaciones |
| GET | `/api/solicitudes/:id/adjuntos/:adjId` | JWT | Contenido (dataUrl) bajo demanda — los listados NO incluyen el dataUrl |
| PATCH | `/api/solicitudes/:id/adjuntos/:adjId` | JWT | **#60:** publicar/retirar el documento del portal del cliente (`{paraCliente}`) → actuación en la línea de tiempo. El estado del expediente (cerrado o no) no afecta el acceso |
| PATCH | `/api/solicitudes/:id/data` | JWT | Actualiza el JSON del tipo con recálculo server-side (reparación, servicio público, DP, terminación, reporte de pago — transiciones de conciliación validadas con `puedeTransicionarReporte`) |
| POST | `/api/solicitudes/:id/respuesta` | JWT | Registrar la respuesta al solicitante y su envío (fecha, medio). Con medio CORREO el sistema envía el email con hasta 3 adjuntos (PDF). Nació para DP pero aplica a todos los tipos (ago 2026) |
| POST | `/api/solicitudes/:id/servicio-share` | JWT | Link público del PDF de la liquidación de servicio |
| POST | `/api/solicitudes/:id/servicio-email` | JWT | PDF por correo (Gmail API, anti-duplicado 1 h) |
| GET | `/api/solicitudes/public/:token/servicio-pdf` | **No** | PDF público de la liquidación de servicio |

---

## GPS y rastreo

- **Web (Chrome Android):** `setInterval` cada 30 s + Wake Lock API + `visibilitychange`
- **APK nativo:** `@capacitor-community/background-geolocation` con Android Foreground Service
  (dispara al moverse ≥20 m) + heartbeat 2 min (solo primer plano — Android congela
  timers JS al minimizar) + ping al reabrir (resume)
- La detección se hace en runtime con `Capacitor.isNativePlatform()` en `src/utils/geo.js`;
  `getCurrentPosition` usa el plugin nativo primero en APK (funciona en background)
- El campo `connectedSince` se actualiza en cada login; `lastSeenAt` en cada ping GPS
- **Check-in horario** (`LocationLog`, máx. 1/hora): garantizado por el cron
  `locationReminders.js` (esquema de 2 niveles, lógica pura en `reminderPolicy.js`
  con tests): silencio ≥50 min → **ping FCM data-only** (la app auto-reporta sin
  molestar, si el proceso vive); ≥75 min → **notificación visible** con sonido
  (máx. 1/hora). Solo horario laboral (L-V 9-18, Sáb 9-13, hora Bogotá)

## Notificaciones push (FCM)

- Tokens por dispositivo en tabla `UserFcmToken` (multi-dispositivo, poda de inválidos)
- Envíos del backend: broadcasts (admin), personales (`utils/notify.js` — contratos,
  reasignaciones) y recordatorios de ubicación. **Todos** los mensajes visibles usan
  `androidAlertConfig()` de `src/utils/fcmConfig.js`: canal `visittrack_alerts`
  (alta importancia → banner heads-up + sonido + vibración)
- El canal lo crea el APK desde JS al registrar FCM (`FirebaseMessaging.createChannel`
  en Layout.jsx) — **no requiere recompilar APK**. Si el dispositivo no lo tiene aún,
  FCM cae a su canal por defecto (no se pierde la notificación)
- El listener `notificationReceived` auto-reporta ubicación cuando llega
  `location_ping`/`location_reminder`; el tap (`notificationActionPerformed`)
  navega a la agenda y también reporta
- `/api/users/locations` devuelve `notifDevices` (tokens por agente) — Tracking
  muestra badge "Sin notif." para agentes sin push registrado
- Requiere `FIREBASE_SERVICE_ACCOUNT` en Railway (si falta, FCM se desactiva con warning)

---

## Variables de entorno

| Variable | Dónde | Para qué |
|----------|-------|---------|
| `DATABASE_URL` | Railway (backend) | Conexión PostgreSQL |
| `JWT_SECRET` | Railway (backend) | Firma de tokens |
| `VITE_GOOGLE_MAPS_API_KEY` | `.env` local + Railway + GitHub Secret | Google Maps en el frontend (mapa + Places). **Se embebe en build-time**, por eso debe estar también en Railway |
| `GOOGLE_MAPS_API_KEY` | `.env` local + Railway | Geocoding del servidor (respaldo) — `property.controller.js` |
| `VITE_API_URL` | `.env` local (vacío = proxy) | URL del backend |
| `PORTAL_ORIGIN` | Railway (backend) | Origen(es) del Portal de Clientes para CORS, separados por coma (ej. `https://portal.tullaveinmobiliariasas.com,https://….up.railway.app`) — P1. **Coincidencia exacta**: cada origen debe ir completo |
| `PORTAL_DEBUG_OTP` | solo local (`=1`) | Imprime el código OTP en la consola para probar sin Gmail. **Nunca en producción** |

Secreto en GitHub Actions: `VITE_GOOGLE_MAPS_API_KEY`

> ⚠️ **Las keys de Maps fueron rotadas (jun 2026).** Local y producción usan
> **valores distintos** (ambos válidos): la de Railway es independiente de la del
> `.env`. Si el mapa muestra `ExpiredKeyMapError`, la key de ese entorno está
> muerta → copiar la vigente desde Google Cloud Console (proyecto
> `Tullave-Mapas-App`). La key es de navegador, restringida por referrer
> (incluye `localhost:3000/5173` y el dominio de Railway). **No** se guarda el
> valor en este repo. Proyecto en Google Cloud: `Tullave-Mapas-App`; APIs
> habilitadas: Maps JavaScript API, Places API, Geocoding API.

---

## Comandos útiles

```bash
# Desarrollo local
npm run dev          # Inicia Vite (frontend en :5173)
node server.js       # Inicia Express (backend en :3000)
npx prisma studio    # UI de base de datos

# Producción / build
npm run build        # Compila frontend → dist/

# Calidad (CI los corre en cada push — .github/workflows/ci.yml)
npm run lint         # ESLint 9 (flat config en eslint.config.js)
npm test             # Vitest — tests de lógica pura en tests/ (sin BD)

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
- **Lógica testeable en utils:** geofencing (`utils/distance.js`), solapamiento de
  visitas (`utils/scheduleConflict.js`), WhatsApp (`utils/phone.js`) — con tests en
  `tests/`. Al tocarlos, correr `npm test`
- **Marcadores de mapa:** usar `utils/mapMarkers.js` (pin por tipo de visita,
  avatar de agente, dots de check-in/out) — no crear íconos inline
- **package-lock:** si se añaden deps, regenerarlo con
  `rm -rf node_modules package-lock.json && npm install --ignore-scripts`;
  regenerarlo con node_modules presente omite binarios de Linux y rompe `npm ci` en CI
- **ESLint pineado a v9** (`eslint-plugin-react` no soporta v10 aún)
- **Esquemas Prisma:** modificar SIEMPRE ambos (`schema.prisma` + `schema.pg.prisma`)

---

## Funcionalidades implementadas

### Agenda (`Agenda.jsx`)
- Vista lista agrupada por bloques horarios (Mañana/Tarde/Noche)
- **Vista mapa** con toggle Lista/Mapa — marcadores de color por tipo de visita; al tocar un marcador aparece una card overlay (fuera del iframe de Maps) con botón "Abrir visita"
- **Filtros rápidos de fecha:** Hoy / Mañana / Esta semana (lun–dom), con resaltado del activo, más rango manual "Del/al". El rango **persiste en `sessionStorage`** (`agendaDateRange`) para no reiniciarse al entrar/salir de una visita. Las fechas se calculan en **hora local** (no UTC) para que "Hoy" sea correcto de noche en Bogotá
- Crear visita con validación de conflictos horarios
- **Campo de notas** en agendar/editar: información libre para el agente (ej.: "estudio realizado, requiere para 6 meses"). Se guarda en `visit.notes`; se muestra en la tarjeta de la lista y en `VisitExecution` (como "Nota del agendamiento" antes de iniciar). Comparte el mismo campo `notes` que el reporte de cierre del agente (que la pre-llena al ejecutar)
- **Modalidad presencial / por llamada** (selector en agendar/editar): `visit.modality` = `ON_SITE`|`PHONE`. Las visitas `PHONE` (captaciones telefónicas) llevan badge "Por llamada" y se registran sin GPS — ver `VisitExecution` y endpoint `complete-call`
- **Editar visita** (botón lápiz, solo PENDING/IN_PROGRESS) — modal que cambia fecha/hora, tipo, modalidad, duración, notas, cliente, agente (admin) y la **dirección/ubicación del inmueble**
- **Dirección con Google Places Autocomplete** (`AddressAutocomplete`): captura `lat/lng` exactos al elegir una sugerencia; ya no depende de la geocodificación del servidor
- **Aviso de inmueble duplicado** al registrar uno nuevo: detecta coincidencia por dirección normalizada O coordenadas a <30 m, y ofrece "usar el existente" sin bloquear
- Muestra el **conjunto/edificio** (`property.client`) bajo la dirección en lista y card del mapa
- Reasignar agente (admin), marcar no atendida, eliminar con contraseña
- **Cancelar visita** (ícono ⊘, cualquier PENDING): modal que exige el motivo →
  status CANCELLED. El motivo se muestra en la tarjeta y el admin recibe la
  novedad por notificación
- **Disciplina de visitas:** el backend bloquea el check-in (`start`, 409) si el
  agente tiene otra visita en curso o una pendiente programada antes de la que
  intenta iniciar — debe finalizarla, marcarla no atendida o cancelarla primero.
  El error en `VisitExecution` incluye botón "Ir a esa visita →". Solo el admin
  puede finalizar una visita sin estar en el sitio (bypass de geofencing en
  `finish`)

### Dashboard (`Dashboard.jsx`)
- **Pestaña General:** 4 métricas (total, completadas, duración prom., conversión %), barras por tipo, tabla paginada, exportar CSV y PDF
- **Pestaña Por Agente:** ranking de agentes con total, completadas (barra %), no atendidas, conversión (semáforo) y duración promedio; medallas 🥇🥈🥉

### Contratos (`Contracts.jsx`) — módulo C1
- El agente diligencia un contrato (**Administración** de inmueble o
  **Arrendamiento** de vivienda urbana) con un wizard por secciones, con
  pre-llenado opcional desde una visita (cliente + inmueble)
- **Varios propietarios (Administración):** el primer propietario es fijo y
  hay una lista opcional "Otro propietario" (`otrosPropietarios`, mismo
  patrón que los deudores solidarios del arrendamiento). Si hay varios, el
  cuadro resumen los numera ("Propietario 1/2/3 · Mandante") y se genera una
  firma de MANDANTE por cada uno. Con un solo dueño el formato no cambia
- **Flujo de aprobación:** DRAFT → el agente lo envía (PENDING_APPROVAL) → el
  admin lo **aprueba** o lo **devuelve con nota** (REJECTED, vuelve a ser
  editable). Notificaciones FCM a admins al enviar y al agente al revisar
- **Corregir un aprobado:** botón "Corregir" (endpoint `reopen`) en contratos
  APPROVED → vuelve a REOPENED (editable), limpia la aprobación y debe pasar
  de nuevo por revisión. Los ya ENVIADOS (SENT) NO se reabren por ahora. El
  PDF de un REOPENED recupera la marca de agua BORRADOR automáticamente
  (`contractPdf.js` marca BORRADOR todo lo que no sea APPROVED/SENT)
- **Vista previa HTML** del contrato completo y **PDF con jspdf** (client-side,
  mismo patrón del export del Dashboard — cero deps nuevas). Los contratos no
  aprobados salen con marca de agua "BORRADOR"
- Arquitectura: definición declarativa de campos en
  `src/utils/contractTemplates.js` (renderiza el formulario Y valida en
  backend); texto legal + interpolación en `src/utils/contractDocument.js`
  (bloques que consumen la vista previa y el PDF `contractPdf.js`);
  montos/fechas en letras en `numeroALetras.js` / `fechaLetras.js` (con tests).
  Datos fijos de la empresa (NIT, cuenta Davivienda, rep. legal) en `EMPRESA`
  de `contractTemplates.js`
- Si el abogado cambia una cláusula → editar `contractDocument.js`; si cambia
  un campo del formulario → `contractTemplates.js` (compartidos
  frontend/backend, sin tocar la página)
- Navegación: sidebar para todos; barra inferior móvil solo para agentes (la
  del admin ya está llena)
- **Envío al cliente (fase 2):** solo contratos APPROVED/SENT. WhatsApp abre
  `wa.me` con mensaje + link público tokenizado
  (`/api/contracts/public/:shareToken/pdf`, sin auth, PDF generado
  server-side con el mismo `contractPdf.js` — jspdf corre en Node). Correo:
  Gmail API sobre la integración Google existente (`utils/gmail.js`, MIME
  con adjunto, sin dependencias nuevas) — **requiere scope `gmail.send`**:
  si Google se conectó antes de este cambio, desconectar y reconectar en
  Ajustes. El popup de WhatsApp se abre ANTES del await (popup blockers)
- **Pendiente (fase 3):** firma electrónica con **Autentic**
  (https://app.autenticsign.com — plataforma que ya usa el cliente)

### Liquidaciones (`Liquidaciones.jsx`) — módulo L1
- Reemplaza el Excel "LIQUIDACION INICIO CONTRATO": prorrateo del primer mes,
  derechos de contrato y firma digital (% de canon+admón, 15% por defecto),
  estudio aseguradora, póliza, otros cargos/descuentos, IVA 19% por concepto,
  abonos y saldo con monto en letras y datos de consignación (Davivienda)
- Se crea **desde un contrato ARRENDAMIENTO aprobado** (botón "Liquidación" en
  la card de Contratos → `/liquidaciones?contractId=N`, que abre la existente o
  crea el borrador). 1:1 por contrato (`contractId @unique`)
- **Sección 1 bloqueada** (el formulario numera sus secciones 1/2/3 — las letras
  A/B/C están reservadas para los grupos del documento): los datos del contrato
  son un snapshot (`data.origen`)
  que solo se refresca con "Re-importar" (`/sync-contrato`) — nunca se editan en
  la liquidación para no generar inconsistencias. Link "Editar contrato de origen"
- **Sección 2**: fechas del cobro, modo admón (proporcional/completa/no cobrar),
  % derechos, estudio, póliza, abonos previos, otros cargos/descuentos — cada
  servicio con toggle IVA. Los **días cobrados son siempre derivados de las
  fechas** (calendario real, ambos extremos incluidos) — no se digitan; el
  server los recalcula en cada PATCH. Las **fechas solo las modifica el admin**:
  el agente usa "Solicitar ajuste de fechas" (fechas propuestas + motivo →
  notificación FCM al admin, badge "Ajuste solicitado" en la card); el admin ve
  la solicitud resaltada en el formulario y la aplica con un clic ("Aplicar
  estas fechas" → guardar). El admin puede editar también en PENDING_APPROVAL
  para ajustar al revisar sin devolver
- **Sección 3**: resumen en vivo con `calcularLiquidacion` de
  `src/utils/liquidacionCalc.js` — **misma lógica pura en frontend, backend y
  PDF** (tests en `tests/liquidacionCalc.test.js`, con paridad verificada contra
  casos reales del Excel). Prorrateo: canon ÷ días reales del mes × días; admón
  siempre ÷ 30 (como el Excel)
- **Estructura del documento (ago 2026, pedido del cliente):** los conceptos van
  **numerados** (1, 2, 3…) y agrupados en secciones **A / B / C**
  (`GRUPOS` en `liquidacionCalc.js`): A = arrendamiento del período, B = gastos
  de legalización del contrato, C = otros cargos y descuentos. Cada subtotal cita
  sus ítems ("Subtotal B (ítems 3 + 4)") y el cierre es "TOTAL LIQUIDACIÓN
  (A + B + C)". **El IVA se presenta UNA sola vez**, en su propia columna por
  ítem: nunca se vuelve a sumar abajo. Reemplazó al recuadro anterior
  (`Subtotal proporcional / Servicios / IVA`), que además **descuadraba**: el
  eliminado `subtotalServicios` solo sumaba las líneas de tipo SERVICIO y dejaba
  los otros cargos/descuentos fuera del recuadro. Hay tests que exigen
  `Σ grupos = totalBase + totalIva = totalGeneral`; el resumen en pantalla usa la
  misma estructura para que app y PDF digan lo mismo
- **Formas de pago en el PDF (ago 2026):** bloque de dos opciones — consignación
  a la cuenta Davivienda y **pago en línea o en puntos Mi Pago Amigo** (convenio
  `TU LLAVE INMOBILIARIA`). Los datos salen de `EMPRESA` en
  `contractTemplates.js` (`pagoEnLinea*`), no van escritos en el PDF. La URL se
  dibuja con `pdf.textWithLink` → es un **enlace real** del PDF (se abre desde el
  correo o el celular); el subrayado se dibuja a mano porque jspdf no lo hace. El
  bloque va en la **columna izquierda, a la misma altura del cuadro de saldo**:
  puesto debajo obligaba una segunda página. Las mismas formas de pago van en el
  **mensaje de WhatsApp y en el correo** al arrendatario, desde el helper
  compartido `mediosDePagoTexto(referencia)` de `contractTemplates.js` — no
  duplicar el texto en la página ni en el controlador
- **Referencia de pago del banco** (`referenciaPago()` en `liquidacionCalc.js`,
  con tests): `CONJUNTO + TORRE + APTO`, o `DIRECCIÓN + BARRIO` si es casa / no
  hay conjunto. Sale de los componentes sueltos que `buildOrigen` guarda en
  `origen` (`direccionInmueble`, `torreInmueble`, `aptoInmueble`,
  `conjuntoInmueble`, `barrioInmueble`) — `direccionCompleta` sola no sirve. Para
  liquidaciones creadas antes de guardar esos campos hay un respaldo que
  reconstruye lo deducible desde `direccionCompleta`; **nunca inventa conjunto**
  (si no lo puede deducir sin riesgo de confundirlo con la ciudad, cae a la
  dirección). El campo `barrioInmueble` se agregó al contrato de ARRENDAMIENTO
  (opcional). Aparece en el PDF, en WhatsApp/correo y en la sección 1 de la app
- **Flujo igual a contratos**: DRAFT → PENDING_APPROVAL → APPROVED | REJECTED
  (editable de nuevo) — al aprobar el server congela `data.totales`. Reabrir solo
  sin pagos y sin enviar. Notificaciones FCM en cada transición
- **Cuenta por cobrar**: la liquidación APROBADA es la CxC. "Registrar pago"
  (agente dueño o admin) agrega `LiquidacionPago` con auditoría; al llegar el
  saldo a $0 pasa a **PAID** automáticamente. El admin puede eliminar un pago
  (si revive el saldo vuelve a APPROVED). Filtro "Solo con saldo pendiente" y
  total por cobrar en el header (admin)
- **Envío al cliente**: igual que contratos — WhatsApp con link público
  tokenizado (`/api/liquidaciones/public/:token/pdf`), correo con PDF adjunto
  (Gmail API). Compartir marca `sentAt` pero NO cambia el estado (el ciclo
  termina en PAID, no en SENT). PDF de una página con `liquidacionPdf.js`
  (jspdf isomorfo, marca de agua BORRADOR si no está aprobada)

### Incrementos (`Incrementos.jsx`) — módulo I1 (epic #44)
- Gestión del incremento anual de canon: base de fichas auto-alimentada,
  dashboard semaforizado, carta automática y aplicación del nuevo canon.
  Admin gestiona todo; el agente ve/envía las de sus contratos
- **Fichas (#45)** — tres vías de alta: automática al APROBAR un contrato
  ARRENDAMIENTO (hook en `contract.controller.js` → `crearFichaDesdeContrato`,
  silencioso), botón "Cargar desde contratos" (backfill de aprobados sin ficha)
  e "Importar CSV" para los históricos de Wasi (el frontend parsea — acepta
  alias de encabezados y fechas DD/MM/YYYY — y el backend deduplica por código
  Wasi). `canonActual` es el canon VIGENTE: cada aplicación lo actualiza
- **Detección (#47)** — `startIncrementoCron` en server.js: diaria (7am Bogotá)
  y al arrancar. `aniversariosEnRadar` (lógica pura, con tests) mete al radar
  el próximo aniversario dentro del horizonte (`INCREMENTO_ANTICIPACION_DIAS`,
  90 por defecto) **y el recién vencido** (retrovisor 90 días): en la migración
  inicial, un contrato cuyo aniversario acaba de pasar nace como tarea VENCIDA
  en vez de saltar en silencio al año siguiente. Sin duplicados por el
  `@@unique(fichaId, periodo)`. Notifica a admins cuántos entraron
- **Cálculo (#46)** — `incrementoCalc.js` compartido frontend/backend/PDF:
  `Nuevo canon = canon × (1 + pct/100)` redondeado **al peso exacto** (decisión
  del cliente, sin redondeo a miles). El % sale del tipo pactado: IPC del año
  (tabla `IndiceAnual`, la configura el admin en el modal "IPC"), IPC + puntos,
  o % fijo. Sin índice configurado el incremento queda "Sin índice" (no bloquea
  la detección; `procesar-mes` lo recalcula cuando el admin fija el IPC). El
  admin puede sobreescribir % y fecha por incremento (PATCH, solo PENDIENTE)
- **Semáforo (#52)** — `semaforo()` puro: negro (vencido sin aplicar), rojo
  (≤15 días sin enviar), naranja (<30), amarillo (30–60), verde (>60), azul
  (carta enviada esperando fecha). Listado ordenado con `compararUrgencia`
- **Dashboard (#48)** — 4 contadores clicables (filtran la lista):
  esta semana / este mes / próximo mes / pendientes de aplicar
  (`grupoDashboard` puro, con tests)
- **Carta (#49)** — texto en `incrementoDocument.js` (Ley 820 de 2003 art. 20;
  si cambia la redacción se toca SOLO ese archivo), PDF en `incrementoPdf.js`
  (jspdf isomorfo, membrete + pie + marca BORRADOR si PENDIENTE), vista previa
  HTML con los mismos bloques. Correo con PDF adjunto vía Gmail API y WhatsApp
  con link público tokenizado (mismo patrón de contratos/liquidaciones)
- **Trazabilidad (#51)** — al enviar (share O email) se congela el snapshot de
  la carta en `Incremento.data` (el PDF se regenera idéntico aunque la ficha
  cambie) y se escriben una sola vez cartaEnviadaAt / enviadaPor(Nombre) /
  enviadaA / shareToken → status ENVIADA. No editables
- **Historial (#53)** — expandible en cada ficha: período, canon anterior → 
  nuevo, %, estado, fecha de envío y acceso a la carta/PDF de cada año
- **Procesar incrementos del mes (#54)** — botón admin: detecta aniversarios
  hasta fin del mes siguiente, recalcula pendientes sin índice y resume
  listos / sin índice / con datos incompletos (los incompletos se marcan en la
  card con ⚠ y los faltantes)
- **Aplicación (#50, parcial)** — "Aplicar" (admin) actualiza `canonActual` de
  la ficha y cierra el incremento (transacción; doble aplicación bloqueada por
  status). La aplicación AUTOMÁTICA en fecha efectiva + propagación a
  liquidación mensual/cartera/pago propietario queda pendiente de que existan
  esos módulos (decisión ago 2026: #50 se retoma al final)

### Centro de Solicitudes (`Solicitudes.jsx` + `SolicitudDetalle.jsx`) — módulo S1 (epic #32)
- Centraliza las solicitudes de propietarios/arrendatarios/terceros que llegan
  por WhatsApp/correo/llamada: el equipo las RADICA (no hay portal público en
  esta fase). Permisos: cualquier usuario radica; cada quien ve su bandeja
  (asignadas + radicadas por él); el admin ve todo, asigna y elimina
- **Expediente (#34)** — radicado consecutivo por año (`SOL-2026-0001`, retry
  ante colisión), solicitante como datos sueltos + links opcionales a
  Property/Contract, prioridad, medio de ingreso, responsable, vencimiento
- **Máquina de estados (#33)** — `solicitudFlow.js` (puro, con tests):
  Recibida → En revisión → En gestión → Pendiente de tercero → Finalizada →
  Archivada; retrocesos de un paso y reabrir permitidos, saltos prohibidos
  (server-side). Cada transición → actuación + FCM a responsable/creador
- **Línea de tiempo (#38)** — `SolicitudActuacion` inmutable (no hay endpoints
  de edición): creación, estados, asignaciones, notas, adjuntos,
  automatizaciones, respuestas y alertas del cron. Notas manuales con POST
- **Adjuntos (#39)** — base64 en BD (decisión ago 2026: mismo patrón de las
  fotos de visita, sin storage externo; migrar a S3 después no cambia la API).
  Máx. 5 MB/archivo, 10 por subida; imágenes pasan por `compressImage`. El
  dataUrl solo viaja en `GET /:id/adjuntos/:adjId` (los listados no lo cargan).
  Preview de imágenes, PDF y videos en modal. **#60 (ago 2026):** cada adjunto
  tiene un botón 🌐 para publicarlo/retirarlo del portal del cliente (flag
  `paraCliente` + badge "Visible en el portal" + actuación); los documentos de
  la respuesta se publican solos al registrarla
- **Videos (#58, ago 2026)** — adjuntos MP4/MOV de **máx. 1 minuto y 25 MB**
  (categoría VIDEO). Doble validación de duración: el frontend la lee de la
  metadata del `<video>` antes de subir (si el navegador no puede — códec MOV
  raro — deja pasar y decide el server) y el backend la verifica SIEMPRE
  parseando los átomos del contenedor (`utils/videoDuration.js`, puro e
  isomorfo, con tests: moov→mvhd, magic bytes `ftyp`, tolerancia +1 s).
  El body de Express sube a 48 MB SOLO en `/api/solicitudes` y
  `/api/portal/solicitudes` (server.js); por eso el frontend del equipo manda
  cada video en su propio request. Reproductor `<video controls>` en el modal
  de vista previa. **El portal también acepta video** (ver Portal de Clientes):
  máximo UNO por radicación, junto a las fotos, mismas validaciones
- **Tipos (#35)** — tabla administrable; los 11 del epic se siembran en
  `seed.js` (idempotente, no pisa ediciones del admin). Claves derivadas del
  label: `DERECHOS_DE_PETICION`, `SERVICIOS_PUBLICOS`,
  `TERMINACION_DE_CONTRATO`, `REPARACIONES` activan las automatizaciones
- **Reparaciones (#36)** — `data.reparacion`: 6 pasos (caso → fotos →
  cotización → autorización propietario → técnico → finalizada) con stepper,
  cotizaciones (proveedor/monto), técnico + fecha de visita y fotos
  antes/después (categorías de adjunto)
- **Servicios públicos (#37)** — `servicioPublicoCalc.js` (puro, con tests):
  valor diario = total ÷ días del período (extremos incluidos); propietario
  hasta el día ANTES de la entrega, arrendatario desde la entrega; el
  redondeo cuadra al peso (arrendatario = total − propietario). PDF isomorfo
  (`servicioPublicoPdf.js`), link público tokenizado y correo con adjunto.
  El formulario guarda con botón explícito "Calcular y guardar" (guardar
  en blur perdía el último campo por re-renders)
- **Derechos de petición (#41)** — término legal en DÍAS HÁBILES
  (`diasHabiles.js`: festivos de Colombia — Ley Emiliani + Pascua por Butcher,
  con tests contra el calendario 2026): general/queja 15, documentos 10,
  consulta 30 (Ley 1755 de 2015). Alertas escalonadas del cron (7:30am Bogotá
  + arranque): mitad del término, ≤3 días, vence hoy, vencido — cada nivel UNA
  vez (`data…alertasEnviadas`), FCM al responsable (+admins si crítico) y
  actuación ALERTA. Respuesta con registro de envío (fecha/medio)
- **Terminación (#42)** — `terminacionCheck.js` (puro, con tests) lee el
  contrato ARRENDAMIENTO vinculado: vigencia, preaviso de 3 meses (días de
  retraso si no se cumple) e indemnización de 3 cánones si la entrega es
  anticipada (cláusula penal del contrato / art. 24-4 Ley 820). Panel con ✅/❌
  y observaciones; "Fecha deseada de entrega" recalcula con botón Verificar
- **Bandeja (#43)** — agrupada por tipo, ordenada por `compararBandeja`
  (vencidas → por vencer → prioridad → fecha límite); el admin puede ver la
  bandeja de cualquier funcionario (las sin asignar aparecen en la suya)
- **Dashboard (#40)** — KPIs (abiertas, cerradas, vencidas con alerta visual,
  tiempo promedio de respuesta vía `finalizadaAt`), distribución por
  tipo/estado y tendencia por mes. **#61 (ago 2026):** las tarjetas Abiertas/
  Cerradas/Vencidas son clicables — filtran el tab "Todas" (misma definición
  del backend: vencida = abierta con `urgencia === 'VENCIDA'`), resaltan la
  activa con ring, muestran chip "✕" para quitar el filtro y el mismo clic
  vuelve a quitarlo; "Respuesta promedio" sigue siendo informativa
- **Radicación múltiple (#57, ago 2026)** — un cliente con varias solicitudes
  a la vez marca VARIOS tipos en una sola radicación (equipo y portal:
  checkboxes en vez de select). Decisión: opción 2 del issue — se crea UN
  expediente por tipo (cada uno conserva su radicado, su máquina de estados,
  sus términos legales y automatizaciones), vinculados en `data.grupo.radicados`
  (`vincularGrupo` en solicitud.controller.js). El detalle muestra "Radicada
  junto con: SOL-…" (equipo y portal); las actuaciones de creación citan a los
  hermanos. Las fotos van al expediente de REPARACIONES si lo hay (si no, al
  primero); el PDF del DP y el comprobante de pago van a SU expediente. El tope
  del portal (10 radicaciones/día) cuenta un expediente por tipo
- **Respuesta al solicitante (ago 2026)** — el panel "📨 Respuesta al
  solicitante" de `SolicitudDetalle` aparece en TODOS los tipos (antes solo en
  el DP, dentro de su panel legal): las respuestas a un requerimiento a veces
  son documentos formales. El formulario permite **subir el PDF directamente**
  ("Adjuntar PDF" — va al expediente con categoría PDF/FOTO y queda marcado
  solo como documento de la respuesta, máx. 3) y con medio CORREO el sistema
  envía el email al solicitante con los adjuntos. El backend
  (`registrarRespuesta`) siempre fue genérico; la restricción era solo del
  frontend. El portal ya mostraba `data.respuesta` con sus adjuntos
  descargables para cualquier tipo
- **Reporte de pago (#55, ago 2026)** — tipo `REPORTE_DE_PAGO` (sembrado):
  el arrendatario reporta un pago (valor, fecha, medio Nequi/Davivienda/
  transferencia/efectivo/otro, referencia) con **comprobante obligatorio**
  (foto o PDF, categoría COMPROBANTE) desde el portal. Ciclo de conciliación
  propio en `data.reportePago.estado` — REPORTADO → EN_VERIFICACION →
  CONCILIADO | RECHAZADO (transiciones en `solicitudFlow.js`
  `TRANSICIONES_REPORTE`, sin saltos, retroceso para corregir) — encima de la
  máquina de estados general del expediente. El equipo concilia desde el panel
  🧾 de `SolicitudDetalle` (`ReportePagoPanel`): editar datos, verificar,
  conciliar (nota opcional) o rechazar (motivo obligatorio, el cliente LO VE
  en el portal); auditoría `resueltoPor/resueltoAt`. El portal muestra la card
  "Pago reportado" con estado en lenguaje de cliente (`REPORTE_ESTADOS` en su
  estados.jsx). La conciliación contra cartera queda pendiente del módulo de
  cartera (no existe aún)

### Portal de Clientes (backend `/api/portal`) — módulo P1 (ago 2026)
- **El frontend vive en otro repo:** `../PORTAL_CLIENTES_TULLAVE` (React+Vite+
  Tailwind, ver su CLAUDE.md). Decisión: portal separado para no engordar esta
  app; aquí solo vive el módulo backend AISLADO — `portal.controller.js`,
  `portal.routes.js`, `portalAuth.middleware.js`, `utils/portalAuth.js` — que
  no toca ningún endpoint del equipo
- **Acceso sin contraseña:** correo + OTP de 6 dígitos (tabla `PortalOtp`,
  hash SHA-256, 10 min de vida, 5 intentos, máx. 3 códigos/15 min → 429). El
  correo sale por `sendTextEmail` (Gmail API); **en dev el código se imprime
  en la consola del servidor** (probar sin Gmail conectado). JWT de 30 días
  firmado con secreto DERIVADO (`JWT_SECRET + '::portal-clientes'`): un token
  del portal da 401 en la API del equipo y viceversa
- **Política de tratamiento de datos (ago 2026, Ley 1581):** el login exige
  marcar "He leído y acepto la Política de tratamiento de datos personales"
  (enlace a `tullaveinmobiliaria.com.co/main-contenido-cat-6.htm`, constante
  `POLITICA_DATOS_URL` en el `config.js` del portal) antes de pedir el código.
  `solicitar-codigo` valida `aceptaPolitica: true` server-side (no se puede
  saltar por API) y deja constancia en la tabla `PortalConsentimiento` (una
  fila por correo: primera aceptación, última y contador — prueba del
  consentimiento). Si el registro falla no bloquea el acceso
- **Identidad = correo verificado:** el cliente solo ve expedientes cuyo
  `solicitanteEmail` coincide (ajenos → 404). Vista BLANQUEADA: timeline solo
  con CREACION/ESTADO/RESPUESTA y sus propias NOTAs (`meta.portal`); nunca
  notas internas, responsable, data del tipo ni adjuntos internos. **#60:** el
  detalle expone `documentos` (adjuntos con `paraCliente` o referenciados en
  la respuesta) descargables vía `GET /solicitudes/:id/documentos/:adjId`
  (la ruta vieja `/respuesta-adjuntos/:adjId` se conserva); el portal los
  muestra en la card "Documentos de tu solicitud" **también con el caso
  cerrado/archivado** — cerrar nunca restringe la lectura
- **Radicación:** mismo consecutivo `SOL-AAAA-NNNN` (se exportó
  `generarRadicado`), `medioIngreso: 'PORTAL'` (agregado al enum y a
  `MEDIOS_INGRESO`), `creadaPor` = usuario sistema "Portal de Clientes"
  (`portal@tullave.sistema`, rol PORTAL, contraseña aleatoria — no puede
  loguearse). Inicializa las mismas automatizaciones que el equipo (DP con
  término legal, reparaciones). Notifica a admins por FCM; los comentarios
  del cliente notifican al responsable
- **Radicación (pedidos del cliente, ago 2026):** dirección ESTRUCTURADA con
  los mismos campos del contrato (`direccionInmueble` + torre/apto/conjunto/
  barrio + `ciudadInmueble`); dirección, ciudad y celular OBLIGATORIOS. La
  dirección compuesta (mismo orden de `buildOrigen`) encabeza `descripcion`
  ("Inmueble: …") y los componentes quedan en `data.inmueble` (para futura
  referencia de pago / vínculo a Property). Hasta **5 archivos** por
  radicación entre fotos (`image/*`, 5 MB c/u, categoría FOTO, compresión
  client-side con el mismo `imageCompress`) y **máximo 1 video** (#58:
  MP4/MOV, 1 min y 25 MB, categoría VIDEO — mismas validaciones server-side
  del equipo; uno solo porque la radicación viaja en un único POST); el
  cliente ve sus fotos/video en su timeline (`meta.portal`), el equipo los ve
  como adjuntos normales (video con reproductor). **#57:** acepta
  `tipos: [...]` (checkboxes en el portal, un expediente por tipo, vinculados).
  **#55:** con tipo REPORTE_DE_PAGO exige `reportePago` (valor/fecha/medio) y
  `comprobante` (foto o PDF); el detalle del cliente expone la card del pago
  con su estado de conciliación y el `grupo` de la radicación
- Endpoints: `POST /auth/solicitar-codigo`, `POST /auth/verificar`,
  `GET /tipos`, `GET|POST /solicitudes`, `GET /solicitudes/:id`,
  `POST /solicitudes/:id/comentario` — todos bajo `/api/portal`, auth
  `authenticatePortal` (nunca `authenticate`)
- **Correo de bienvenida** (`utils/portalWelcome.js`, texto puro con tests):
  cuando el EQUIPO radica con correo del cliente — o se lo agrega/corrige en
  un PATCH — se le envía el radicado + link del portal (fire-and-forget, deja
  actuación AUTOMATIZACION). La URL sale del primer origen de `PORTAL_ORIGIN`;
  sin esa env var no se envía. Las radicadas DESDE el portal no lo mandan
- **En producción:** portal en `https://portal.tullaveinmobiliariasas.com`
  (servicio Railway propio, repo GitHub `harbey-26/PORTAL_CLIENTES_TULLAVE`,
  DNS en Squarespace). `PORTAL_ORIGIN` en Railway lleva ese dominio + la URL
  `.up.railway.app` del servicio. Fase 2 pendiente: Capacitor Android + iOS
- **Endurecimiento de seguridad (ago 2026, tras auditoría):**
  - Adjuntos: el peso se mide del base64 real (`bytesRealesDataUrl` en
    `utils/dataUrl.js`) — el `size` que declara el cliente puede mentir y
    dejaba el límite de 5 MB en decorativo. Fotos solo JPG/PNG/WEBP (SVG
    fuera: scripts embebidos); nombres saneados (`nombreArchivoSeguro`)
  - Correo: **todas** las cabeceras MIME se sanean en `gmailMime.js`
    (`sanitizeHeader`) y el boundary es aleatorio por mensaje — un CRLF en un
    destinatario o en el nombre de un adjunto inyectaba cabeceras (`Bcc:` a un
    tercero). `solicitanteEmail` valida formato con Zod
  - Límites (`utils/rateLimit.js`): OTP 3/correo/15 min + 120/hora global
    (email bombing) + 10 por IP; radicaciones 10/día por cliente y 30/h por IP
  - OTP: se validan todos los códigos vigentes (pedir códigos nuevos ya no
    deja fuera al cliente), comparación `timingSafeEqual`, y el código solo se
    escribe en el log con `PORTAL_DEBUG_OTP=1` (antes dependía de `NODE_ENV`,
    que es fail-open)
  - Sesión del portal: 14 días (era 30; el JWT no se puede revocar)
  - CORS por coincidencia EXACTA (antes `startsWith` dejaba pasar
    `…tullaveinmobiliariasas.com.attacker.net`) — cada puerto local usado debe
    estar en `defaultOrigins`; cuerpo de 16 KB en las rutas de auth
  - El portal sirve CSP + cabeceras de seguridad desde su propio `server.js`

### Otras páginas
- `VisitExecution.jsx` — iniciar/finalizar visita con GPS + geofencing, fotos, cronómetro; muestra el conjunto/edificio bajo la dirección. **Visitas por llamada (`modality === 'PHONE'`):** ocultan el mapa y el flujo GPS; muestran resultado+comentarios y un "Desliza para registrar" que cierra la visita en un paso (`complete-call`), sin pedir ubicación
- **Acciones con `SlideToConfirm`** (iniciar / finalizar / registrar llamada): el
  gesto de arrastre ES la confirmación, por eso ya **no hay modal** de "¿confirmas?".
  El control anima la estela de color, hace vibrar el dispositivo y muestra check +
  onda al completar; si la acción falla (GPS, geofencing, red) vuelve solo a la
  posición inicial para reintentar — esa recuperación depende de que el padre pase
  `loading` y lo baje a `false` en el error. Se **bloquea** (`disabled`) mientras
  falte el resultado de la visita, en vez de validar después del gesto
- `Tracking.jsx` — mapa en tiempo real de agentes con clustering y comunicados; tabla "Check-in horario" muestra el nombre completo del agente
- `Users.jsx` / `Properties.jsx` — CRUD completo. Inmuebles usa `AddressAutocomplete` (Places) + picker de mapa manual como ajuste fino

---

## Notas importantes

- `android/` e `ios/` están en `.gitignore` — se generan en CI, nunca se commitean
- `dist/` está en `.gitignore` — Railway corre el build en el servidor
- El `postinstall` en `package.json` corre `prisma generate + build` para Railway;
  el workflow de CI usa `npm ci --ignore-scripts` para evitarlo
- Los paquetes `@capacitor/geolocation` y `@capacitor-community/background-geolocation`
  están marcados como `external` en `vite.config.js` — el runtime nativo los resuelve
- La dependencia `firebase` (SDK cliente) **parece muerta pero NO lo es**: ningún
  archivo propio la importa, pero `@capacitor-firebase/messaging` la usa como peer
  dependency opcional (`firebase/messaging` en su implementación web) y Vite la
  necesita en build-time — quitarla rompe `npm run build` con `MISSING_EXPORT`
- La label del step en el workflow dice "Setup Java 17" pero usa Java 21 (Capacitor v8 lo requiere)
- **Google Maps — loader centralizado:** todos los `useJsApiLoader` deben importar y pasar `MAPS_LOADER_OPTIONS` desde `src/utils/mapsLoader.js` (mismo `id: 'google-map-script'` y mismas `libraries: ['places']`). Si un componente carga el script con opciones distintas, Google lanza "Loader must not be called again with different options" y, al navegar entre páginas con mapa, el ErrorBoundary lo captura como "error inesperado". Lo usan: Agenda, Tracking, VisitExecution, Properties
- **Direcciones:** se capturan con `AddressAutocomplete` (Google Places) que entrega `lat/lng` exactos desde el navegador. El geocoding del servidor (`property.controller.js`, `process.env.GOOGLE_MAPS_API_KEY`) es solo respaldo y **falla en producción** si la key está restringida por referrer (las llamadas de servidor no llevan referrer) — por eso Places es el camino principal
- **Editar inmueble usa `PUT`**, no `PATCH` (la ruta es `router.put('/:id')`). Enviar PATCH da 404
