# APP VISITAS TULLAVE

Aplicación para la gestión de visitas inmobiliarias, control de agentes y agenda.

## 🚀 Instalación Local

1.  **Clonar y configurar:**
    ```bash
    git clone <repositorio>
    cd APP_VISITAS_TULLAVE
    npm install
    ```

2.  **Base de Datos (Local):**
    Asegúrate de tener el archivo `.env` configurado o usa SQLite por defecto.
    ```bash
    npx prisma generate
    npx prisma db push
    ```

3.  **Ejecutar:**
    ```bash
    npm run dev  # Inicia Vite (Frontend)
    node server.js # Inicia Backend (Puerto 3000)
    ```

## ☁️ Despliegue en Railway

Esta aplicación está configurada para desplegarse en Railway.

### Configuración Crítica de Base de Datos
Para evitar errores de conexión (`502 Bad Gateway` o `Can't reach database`), **NUNCA** uses la URL pública en las variables de entorno del backend.

**Usa siempre Variables de Referencia:**
En el servicio **Backend** -> **Variables** -> `DATABASE_URL`:
```
${{Postgres-QKHb.DATABASE_URL}}
```
*(Reemplaza `Postgres-QKHb` con el nombre exacto de tu servicio de base de datos en Railway)*.

### Dominios Personalizados
Para cambiar la URL por defecto (`...up.railway.app`):
1.  Ve a **Settings** -> **Networking** -> **Custom Domain**.
2.  Configura tu dominio propio (ej. `api.tullave.com`) mediante registros CNAME.

---
Desarrollado para Tullave Inmobiliaria.
