# Boss Dental — Admin Suite (Frontend)

Panel administrativo interno para Boss Dental. Stack: **React 19 + Vite + Tailwind + shadcn/ui**.
Diseñado para conectarse al backend Spring Boot (auth real con JWT) y caer a un **mock fallback** cuando el backend no está disponible.

> Importante: la web pública NO vive en este repo. Este proyecto es solo el panel administrativo.

---

## 1) Requisitos

- Node 20+ (recomendado 20.x LTS)
- npm 10+
- (Opcional) Spring Boot backend corriendo en `http://localhost:8080`

> No usar `yarn`. El proyecto migró a `npm`.

---

## 2) Instalación

```bash
cd frontend
npm install
```

---

## 3) Levantar el proyecto en local

```bash
npm run start
# o
npm run dev
```

Abre `http://localhost:3000`.

Scripts disponibles (`package.json`):

| Script           | Acción                                       |
|------------------|----------------------------------------------|
| `npm run dev`    | Vite dev server (puerto por defecto)         |
| `npm run start`  | Vite dev server en `0.0.0.0:3000`            |
| `npm run build`  | Build producción → `dist/`                   |
| `npm run preview`| Servir el build de producción                |

---

## 4) Variables de entorno

Todas las variables consumidas por el frontend deben llevar el prefijo **`VITE_`** (Vite no expone otras).

### Archivos `.env`

| Archivo            | Cuándo se usa                       |
|--------------------|-------------------------------------|
| `.env`             | Default genérico                    |
| `.env.local`       | **Desarrollo local** (gitignoreable)|
| `.env.production`  | Build producción (`npm run build`)  |

### Variables

| Variable               | Descripción                                                                 |
|------------------------|------------------------------------------------------------------------------|
| `VITE_API_BASE_URL`    | **Base URL del backend Spring Boot**. Todos los endpoints se concatenan aquí. |
| `REACT_APP_BACKEND_URL`| Legacy, reservada por la plataforma. No la borres.                           |

### Ejemplo de `.env.local` (desarrollo contra backend productivo)

```dotenv
VITE_API_BASE_URL=https://api.bossdental.com.mx
REACT_APP_BACKEND_URL=http://localhost:3000
```

> El backend VPS tiene CORS configurado para `http://localhost:3000`. Si quieres probar contra un Spring Boot local, ajusta a `VITE_API_BASE_URL=http://localhost:8080` (o el path que tu API exponga).

### Ejemplo de `.env.production` (cuando despliegues backend en VPS)

```dotenv
VITE_API_BASE_URL=https://api.bossdental.com.mx/api
REACT_APP_BACKEND_URL=https://app.bossdental.com.mx
```

---

## 5) Fallback Mock (activar/desactivar)

El fallback mock permite seguir trabajando aunque el backend Spring Boot no responda. Solo se activa con **errores de red** (`ERR_NETWORK`, `Network Error`, `ECONNABORTED`). Un 400/401 del backend NO activa fallback — se trata como "Credenciales incorrectas".

**Switch:** `src/config/api.js`

```js
// Modo mock-fallback: activar si el backend real no responde
export const ALLOW_MOCK_FALLBACK = true;  // ← cambia a false para desactivar
```

- `true` (default): si la red falla, el frontend usa el mock de `services/auth.service.js`.
- `false`: cualquier fallo del backend muestra error en el login y bloquea el acceso.

### Cuentas mock (cuando el fallback está activo)

| Rol           | Email                              | Password    |
|---------------|------------------------------------|-------------|
| ADMIN         | `admin@bossdental.com.mx`          | `Admin123`  |
| RECEPCIONISTA | `recepcion@bossdental.com.mx`      | `Recep123`  |
| DENTISTA      | `dentista@bossdental.com.mx`       | `Dentista123` |
| PACIENTE      | `paciente@bossdental.com.mx`       | `Paciente123` |

Password para acciones gated (editar cotización, cancelar pago): **`Admin123`**.

---

## 6) Endpoints de Auth esperados (Spring Boot)

Todos relativos a `VITE_API_BASE_URL`. Mapeados en `src/config/api.js`:

```js
export const API_ENDPOINTS = {
  auth: {
    login:    "/auth/login",
    me:       "/auth/me",
    validate: "/auth/validate",
    refresh:  "/auth/refresh",
  },
};
```

### Contratos

#### `POST /auth/login`
```json
// Request
{ "email": "admin@bossdental.com.mx", "password": "Admin123" }

// Response 200
{
  "token": "<jwt>",            // se mapea a accessToken internamente
  "refreshToken": "<jwt>",
  "user": {
    "id": 1,
    "name": "Luis",
    "lastName": "García",
    "email": "admin@bossdental.com.mx",
    "role":   { "id": 1, "name": "ADMIN",      "description": "Administrador" },
    "branch": { "id": 1, "name": "Ecatepec" }
  }
}

// Response 400/401 → muestra "Credenciales incorrectas" (sin fallback mock)
```

#### `GET /auth/me`  (header `Authorization: Bearer <token>`)
Devuelve el mismo shape de `user` que `/auth/login`.

#### `POST /auth/validate`  (header `Authorization: Bearer <token>`)
```json
// Response 200
{ "valid": true, "email": "admin@bossdental.com.mx" }
```

#### `POST /auth/refresh`
```json
// Request
{ "refreshToken": "<jwt>" }

// Response 200 (cuando el backend ya devuelva nuevo accessToken)
{ "accessToken": "<new-jwt>", "refreshToken": "<rotated-jwt>" }

// Compatibilidad: también acepta { "token": "<new-jwt>", "refreshToken": "..." }
```

> El httpClient ya maneja **refresh single-flight**: si varios requests reciben 401 a la vez, solo dispara un refresh y reintenta toda la cola.

### Roles esperados

Backend devuelve `role.name` en inglés (`ADMIN`, `RECEPTION`, `DENTIST`, `PATIENT`). El frontend mapea internamente a `ADMIN`, `RECEPCIONISTA`, `DENTISTA`, `PACIENTE` (ver `src/constants/roleRedirectMap.js`).

### Timeouts de inactividad

Configurados en `src/hooks/useInactivityTimer.js`:

| Rol                              | Timeout |
|----------------------------------|---------|
| ADMIN / RECEPTION / DENTIST      | 24 h    |
| PATIENT                          | 30 min  |

Los timers se reinician con `mousemove`, `keydown`, `click`, `scroll`, `touchstart`.

---

## 7) Estructura de carpetas relevante

```
frontend/
├── src/
│   ├── config/api.js               # VITE_API_BASE_URL + ENDPOINTS + ALLOW_MOCK_FALLBACK
│   ├── services/
│   │   ├── httpClient.js           # axios + interceptors (401 refresh)
│   │   ├── authApi.js              # login / me / validate / refresh
│   │   ├── session.js              # tokens + user + normalizeUser
│   │   └── auth.service.js         # MOCK auth fallback (clinicStore)
│   ├── context/AuthContext.jsx     # bootstrap, login, logout, fallback mock
│   ├── hooks/useInactivityTimer.js # timeouts por rol
│   ├── constants/roleRedirectMap.js# BACKEND_TO_INTERNAL_ROLE
│   ├── store/clinicStore.js        # estado mock central (localStorage)
│   ├── features/                   # auth, dashboard, patients, etc.
│   ├── layouts/                    # AdminLayout
│   ├── guards/ProtectedRoute.jsx
│   └── routes/AppRoutes.jsx
├── .env.local
├── .env.production
├── vite.config.js
└── package.json
```

---

## 8) Flujo de validación local sugerido

1. Arranca tu Spring Boot en `http://localhost:8080`.
2. Confirma que la URL del login funciona: `curl -X POST http://localhost:8080/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@...","password":"..."}'` (ajusta `/api` si tu context path es distinto).
3. Asegúrate de que el backend acepta el origen `http://localhost:3000` (CORS).
4. `npm run start` en `frontend/`.
5. Login en `http://localhost:3000` → debe pegarle a tu backend real.
6. Si quieres forzar el flujo mock para QA, apaga tu backend y vuelve a hacer login — el fallback mock se activará automáticamente.

---

## 9) Troubleshooting

- **Login marca "Credenciales incorrectas" pero el backend está caído**: el frontend recibió un `4xx` real. Si esperabas mock, asegúrate de que el backend esté apagado del todo (ERR_NETWORK), no respondiendo errores.
- **CORS error en el navegador**: tu Spring Boot no permite `http://localhost:3000`. Agrega `@CrossOrigin` o configura `WebMvcConfigurer`.
- **`401` infinito**: revisa que `/auth/refresh` exista y devuelva un nuevo `accessToken` (o `token`). Si aún no lo tienes, el frontend hará logout y mostrará login otra vez.
- **El sidebar muestra rol incorrecto**: confirma que `user.role.name` viene como `ADMIN | RECEPTION | DENTIST | PATIENT`.
