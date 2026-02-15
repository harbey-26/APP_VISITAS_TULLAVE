---
description: Guía maestra para crear y desplegar aplicaciones con Railway, Postgres y flujo QA/Producción.
---

# Workflow: Estructura y Despliegue de Aplicaciones (Railway + Postgres)

Este documento define el estándar de trabajo para proyectos web desplegados en Railway con base de datos PostgreSQL, utilizando un ciclo de vida de desarrollo con ambientes de QA y Producción.

## 1. Estructura de Control de Versiones (Git)

Mantener siempre dos ramas principales protegidas:

*   **`main`**: Rama de **PRODUCCIÓN**. Código estable, verificado y listo para el usuario final.
    *   *Regla*: Nunca hacer commit directo. Solo recibe Merges desde `develop` o Hotfixes.
*   **`develop`**: Rama de **QA (Calidad)**. Código en pruebas.
    *   *Regla*: Aquí se integran las nuevas funcionalidades (`releases` o `features`) para ser validadas antes de pasar a producción.

### Flujo de Trabajo Diario
1.  Crear rama de trabajo: `git checkout -b feat/nueva-funcionalidad` desde `develop`.
2.  Desarrollar y probar localmente.
3.  Hacer Merge a `develop` para desplegar en QA.
4.  Una vez aprobado en QA, hacer Merge de `develop` a `main` para desplegar en Producción.

---

## 2. Estructura de Base de Datos (Prisma + PostgreSQL)

El proyecto utiliza Prisma como ORM. Es crítico asegurar que la base de datos se inicialice correctamente en cada despliegue.

### Archivos Críticos
*   `prisma/schema.pg.prisma`: Esquema de la base de datos (Tablas, Relaciones).
*   `prisma/seed.js`: Script de "semilla" para crear datos iniciales (ej. Usuario Admin).

### Configuración del `package.json`
El script de inicio (`start`) debe garantizar la migración y el sembrado de datos en la nube automáticamente.

```json
"scripts": {
  "start": "npx prisma db push --schema prisma/schema.pg.prisma && node prisma/seed.js && node server.js",
  "postinstall": "prisma generate --schema prisma/schema.pg.prisma && npm run build",
  "build": "vite build"
}
```
*   **`npx prisma db push`**: Sincroniza la estructura de la BD con el esquema sin borrar datos si es posible.
*   **`node prisma/seed.js`**: Asegura que existan los usuarios base (Admin) al iniciar.
*   **`postinstall`**: Genera el cliente de Prisma y compila el Frontend (Vite) cada vez que Railway instala dependencias.

---

## 3. Configuración de Railway (Infraestructura)

### Servicios Requeridos
1.  **PostgreSQL**: Base de datos gestionada.
2.  **Web Service**: La aplicación (conectada al repositorio GitHub).

### Ambientes (Environments)
En el proyecto de Railway, crear dos ambientes distintos:
1.  **Production**: Se conecta a la rama `main`.
2.  **QA**: Se conecta a la rama `develop`.

### Variables de Entorno
Configurar en "Shared Variables" o independientemente en cada ambiente:
*   `DATABASE_URL`: *Railway Reference Variable* (apuntando al servicio Postgres).
*   `PORT`: `8080` (O el puerto que escuche tu `server.js`).
*   `JWT_SECRET`: Clave para tokens de sesión.
*   `NPM_CONFIG_PRODUCTION`: `false` (A veces necesario para que instale devDependencies si el build lo requiere).

### Triggers (Despliegue Automático)
*   En **Settings** del servicio Web > **Git Triggers**:
    *   Regla 1: Branch `main` -> Deploy to `Production`.
    *   Regla 2: Branch `develop` -> Deploy to `QA`.

---

## 4. Lista de Chequeo de Despliegue (Paso a Paso)

### Para Desplegar Cambios a QA
1.  [Terminal] Asegurar estar en la rama de trabajo o develop.
2.  [Terminal] **CRÍTICO**: Ejecutar Build local para actualizar assets.
    ```bash
    npm run build
    ```
3.  [Terminal] Commitear la carpeta `dist` actualizada (si no está ignorada) o asegurar que el `postinstall` en el servidor la genera. *Recomendación actual: subir dist generado.*
    ```bash
    git add .
    git commit -m "feat: descripción del cambio"
    git push origin develop
    ```
4.  [Navegador] Verificar en `https://tu-app-qa.railway.app`.

### Para Desplegar a Producción
1.  [Terminal] Cambiar a main y fusionar cambios.
    ```bash
    git checkout main
    git merge develop
    ```
2.  [Terminal] Regenerar Build y Commitear (por seguridad).
    ```bash
    npm run build
    git add dist
    git commit -m "chore: prepare release for production"
    ```
3.  [Terminal] Enviar a Producción.
    ```bash
    git push origin main
    ```
4.  [Navegador] Verificar en `https://tu-app-prod.railway.app`.

---

## 5. Troubleshooting Común

**Problema**: "Los cambios de UI no se ven en QA/Prod".
**Solución**: Probablemente el servidor está sirviendo una carpeta `dist` vieja.
1.  Ejecuta `npm run build` localmente.
2.  Asegúrate de que `package.json` tenga el script "postinstall" con `npm run build`.
3.  Fuerza un despliegue manual en Railway CLI: `railway up -e QA`.

**Problema**: "Error de base de datos 'Table not found'".
**Solución**: El esquema no se ha sincronizado.
1.  Revisar logs de Railway.
2.  Verificar que el comando de inicio incluya `npx prisma db push`.
