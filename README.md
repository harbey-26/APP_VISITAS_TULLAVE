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

## Licencia y derechos de autor

© 2026 **Harbey Perdomo**. Todos los derechos reservados.

Este es **software propietario**. El código se publica de forma visible
únicamente con fines de despliegue y transparencia, lo que **no** otorga ningún
derecho de uso, copia, modificación, distribución o comercialización.

Queda prohibido usar, copiar, modificar o distribuir este software sin
autorización previa y por escrito del titular. Consulta el archivo
[`LICENSE`](LICENSE) para los términos completos.

Para licencias comerciales o autorizaciones: **harbey.26@gmail.com**

---
Desarrollado para Tullave Inmobiliaria.
