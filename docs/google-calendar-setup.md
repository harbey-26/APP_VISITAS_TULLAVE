# Integración Google Calendar — Setup

Cómo conectar la app a una cuenta corporativa de Google Calendar para que las visitas
se reflejen automáticamente como eventos.

## 1. Crear el proyecto en Google Cloud

1. Entra a https://console.cloud.google.com y crea (o selecciona) un proyecto.
2. **APIs & Services → Library** → busca **Google Calendar API** → **Enable**.

## 2. Configurar la pantalla de consentimiento

1. **APIs & Services → OAuth consent screen**.
2. Tipo: **External**.
3. Datos: nombre de la app (`TuLlave Visitas`), email de soporte, logo opcional.
4. **Scopes**: añade
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `openid`
5. **Test users**: añade el email de la cuenta corporativa que conectarás
   (mientras la app esté en modo "Testing" solo esa cuenta podrá autorizar).

## 3. Crear credenciales OAuth

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Tipo de aplicación: **Web application**.
3. **Authorized redirect URIs**: añade exactamente la URL del callback:
   - Producción: `https://tu-llave-visitas-e66b.up.railway.app/api/integrations/google/callback`
   - Local: `http://localhost:3000/api/integrations/google/callback`
4. Guarda y copia **Client ID** y **Client Secret**.

## 4. Variables de entorno

En Railway (Settings → Variables) añade:

```
GOOGLE_CLIENT_ID=<tu client id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<tu client secret>
GOOGLE_REDIRECT_URI=https://tu-llave-visitas-e66b.up.railway.app/api/integrations/google/callback
```

En local, agrégalas al `.env`:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback
```

## 5. Conectar desde la app

1. Reinicia el servidor para que tome las env vars.
2. Entra a la app como admin → **Ajustes** → **Google Calendar** → **Conectar**.
3. Se abre una pestaña con el consentimiento de Google; selecciona la cuenta
   corporativa, acepta los permisos, y cierra la pestaña cuando veas el mensaje
   de éxito.
4. Vuelve a la app: el estado debe pasar a **Conectado** con el email de la cuenta.

## 6. Cómo funciona la sincronización

- **Crear visita** → se crea un evento en el calendar principal (`primary`) de la
  cuenta conectada con título `Tipo — Dirección`, descripción con cliente/teléfono/
  agente/notas, y horario en zona `America/Bogota`.
- **Reasignar visita** → se actualiza el evento existente (cambia el agente en la
  descripción).
- **Eliminar visita** → se borra el evento del calendar.

El `eventId` se guarda en `Visit.googleEventId`. Si el evento se borra manualmente
desde Calendar, la próxima sincronización crea uno nuevo.

## 7. Compartir el calendar con los agentes

Si quieres que los agentes lo vean en su propio Calendar:

1. En Google Calendar de la cuenta conectada, abre **Settings del calendario "principal"**.
2. **Share with specific people** → añade los emails de los agentes con permiso
   "See all event details".

## 8. Desconectar

**Ajustes → Google Calendar → Desconectar** borra los tokens. Los eventos ya
creados permanecen en Calendar pero no se actualizarán más.

Para revocar también el permiso por el lado de Google:
https://myaccount.google.com/permissions
