# Boss Dental — PRD & Estado Actual

## Problem statement (original)
Sistema administrativo para clínica dental (Boss Dental). Backend propio en **FastAPI + MongoDB**, frontend React/Vite/Tailwind. Idioma: Español.

## Stack
- **Frontend:** React 19 + Vite + Tailwind + Shadcn (puerto 3000)
- **Backend:** FastAPI + Motor + JWT HS256 + bcrypt (puerto 8001, prefijo `/api`)
- **DB:** MongoDB local (`MONGO_URL`)

## Modelo operativo (P1 cerrado)
Estados de cita: `LOCKED → CONFIRMED → ARRIVED → IN_PROGRESS → COMPLETED` (+ `CANCELLED` desde cualquier estado abierto).
Campos de tracking: `doctorSolicitado`, `doctorAsignado`, `horaProgramada`, `horaLlegada`, `horaInicioReal`, `horaFinReal`.
Capacidad por **sucursal** (no por doctor) — `branch.capacity` configurable, fallback al nº de doctores activos.

## Zona horaria y horario laboral (P2)
- **TZ canónica:** `America/Mexico_City`. Backend (`ZoneInfo`) y frontend (`Intl.DateTimeFormat`) usan esta TZ para "hoy" y "hora actual" — NO UTC.
- **Horario laboral:** Lun-Vie 09:00–18:00, Sáb 09:00–17:00, Dom cerrado.
- **Slots:** intervalos de 30 minutos. Hora fin sugerida = inicio + 1 h.
- Validaciones aplicadas en backend (`POST /appointments/create`) y en frontend (`utils/scheduleTime.js`).

## Variable de entorno frontend
- **Única:** `REACT_APP_BACKEND_URL` (Vite con `envPrefix: ['VITE_', 'REACT_APP_']`).
- Toda llamada al backend pasa por `src/config/api.js` (centralizado), nunca se leen variables de entorno fuera de ese archivo.

## Credenciales (seed idempotente)
| Rol | Email | Password | Vínculo |
|---|---|---|---|
| ADMIN | `admin@bossdental.com` | `admin123` | — |
| RECEPTION | `reception@bossdental.com` | `admin1234` | — |
| DENTIST | `dentist@bossdental.com` | `dentist123` | `doctorId:1` (Carlos Hernández · Ortodoncia) |

## Endpoints disponibles bajo `/api`

### Auth & metadata
- `POST /auth/{login,refresh}`, `GET/POST /auth/{me,validate}`
- `GET /health`

### Pacientes
- `GET/POST /patients`, `GET /patients/{id}/{detail,appointments,activity-logs}`

### Doctores & sucursales
- `GET /doctors/active`, `GET /branches`, `GET /branches/{id}`

### Citas — flujo completo
- `POST /appointments/cleanup-expired-locks`
- `GET  /appointments/start-slots`
- `POST /appointments/lock`
- `GET  /appointments/{id}/end-slots`
- `PUT  /appointments/{id}/{start-time,end-time,dentist,date}` (sobre LOCK)
- `PUT  /appointments/{id}/confirm`
- `PUT  /appointments/{id}/cancel`
- `PUT  /appointments/{id}/reschedule`
- `PUT  /appointments/{id}/arrive`
- `PUT  /appointments/{id}/assign-doctor`
- `PUT  /appointments/{id}/start-attention`
- `PUT  /appointments/{id}/finish-attention`
- `GET  /appointments/{id}`
- `GET  /appointments/schedule/{month,day}`

### Dashboard (admin/recepción)
- `GET /dashboard/appointments/today/{count,}`

### Actividad
- `GET /activity-logs`

### DENTIST (role-gated)
- `GET /dentist/me`
- `GET /dentist/stats`
- `GET /dentist/today`
- `GET /dentist/waiting-room`
- `GET /dentist/in-progress`
- `GET /dentist/completed-today`
- `GET /dentist/agenda`
- `GET /dentist/patients`
- `GET /dentist/activity`

## Implementado ✅
- **2026-06-26 [P0] Módulo de Tratamientos basado en Presupuestos** (25/25 backend, 100% E2E frontend):
  - Nuevos estados de presupuesto: DRAFT → PRESENTED → ACCEPTED → IN_EXECUTION → FINALIZED (más REJECTED y CANCELLED). `ACTIVE` legacy mantenido como alias de PRESENTED con migración lazy.
  - Endpoints transición: `PUT /budgets/{id}/present|accept|reject|finalize|cancel` con logs detallados en español.
  - Nuevo router `/app/backend/routers/treatments.py` + colección `treatments`. CRUD completo: `POST /treatments` (sólo desde ACCEPTED, cascade automático a IN_EXECUTION), `PATCH /activities/{aid}` con outcome shortcuts (`completed`/`continues`/`not_done`), `PUT /finalize` (requiere todas COMPLETED → cascade FINALIZED al presupuesto), `/cancel`, `/pause`, `/resume`. Estados de actividad: PENDING, IN_PROGRESS, COMPLETED, POSTPONED, CANCELLED.
  - Sincronización **automática** presupuesto↔tratamiento durante PATCH de presupuesto IN_EXECUTION: agregar concepto → actividad PENDING; eliminar concepto editable → CANCELLED auto; eliminar concepto COMPLETED → 409 (requiere ajuste especial); PATCH con actividad IN_PROGRESS → 409. Cambio de precio NO propaga a actividades congeladas.
  - Frontend: `TreatmentEditor.jsx` (lista + cards + progress bar + acciones por actividad), `QuotationEditor.jsx` extendido con botones Presentar/Aceptar/Rechazar y footer especial "Iniciar tratamiento" para ACEPTADOS. Cambio automático de pestaña al iniciar tratamiento.
  - Tests: `backend_test_treatments.py` (15), `backend_test_budgets.py` actualizado (10). Total 25/25 PASS.
- **2026-06-26 [P0] Presupuestos — refactor completo** (10/10 backend tests, frontend validado):
  - Backend: `BudgetItemIn` ahora acepta `id` opcional + `observations` por línea. `update_budget` preserva los UUIDs de items y detecta cambios de `unitPrice` por línea, registrando `BUDGET_ITEM_PRICE_CHANGED` con description en español (`<actor> modificó el precio de <concepto> de $X a $Y en el presupuesto «N» del paciente <P>, expediente <E>`) y metadata completa. El precio se guarda congelado en la línea — el catálogo y otros presupuestos del paciente no se ven afectados.
  - Frontend (`QuotationEditor.jsx` reescrito): vista de **lista histórica multi-presupuesto** (collapsible cards con badge por estado), botón **Nuevo presupuesto** bloqueado si hay editable, **textarea "Observaciones / Detalles" por línea** persistente, acciones VISIBLES `Guardar` / `Finalizar presupuesto` / `Cancelar presupuesto` para BORRADOR/ACTIVO, diálogo de confirmación al finalizar/cancelar, modo solo lectura completo (lock icon + leyenda) para FINALIZED/CANCELLED, expansión preservada entre reloads.
- **2026-06-14 [P0]** Pivote completo a FastAPI + MongoDB con seed idempotente. 36/36 pytest.
- **2026-06-14 [P1 base]** Capacidad por sucursal + ciclo de vida + tracking. 23 tests.
- **2026-06-14 [P1 dentist]** Rol DENTIST integrado end-to-end. 18 tests.
- **2026-06 sesión previa** Stack quirks (recarga preview/HMR, VITE_API_BASE_URL), modal de cita con TZ estricto, edición de paciente, finalizar atención, notas clínicas, pagos desde expediente, refactor Cotización→Presupuesto con catálogo.

## Riesgos / pendientes detectados

### Bugs / mejoras menores
- `GET /api/appointments/{id}` puede devolver `durationMinutes:0` cuando endTime no se actualizó tras un confirm en condiciones de DB saturada. Flaky no relacionado.
- (Baja) `PATCH /patients/{id}/budgets/{id}` siempre registra `BUDGET_UPDATED` aunque no haya cambios reales; considerar omitir log si todo coincide para no inflar bitácora.

### Próximas tareas (Fase 2+)
- **P0 — Indicador visual de cita retrasada** en la agenda operativa: borde rojo + etiqueta "Retrasada X min" cuando `horaInicioReal + duración > now`.
- **P0 — Fase 2:** Vista "Pacientes citados", citas sin doctor y alertas de sobrecupo.
- **P0 — Fase 3:** Asignación de doctor desde sala de espera (defaults hora actual + 1h, validaciones).
- **P0 — Fase 4:** Agenda operativa por doctor (sólo asignados) y live updates.
- **P0 — Fase 5:** Reglas estrictas de doctor (alertas sobrecupo, límite 2 pacientes pendientes).
- **P1 — Fase 6:** Ajuste vista mensual con nuevos estados.

## Backlog (P2 / futuro — pausado por instrucción del usuario)
- Sistema de carga de archivos (uploads)
- Catálogos avanzados (servicios, tratamientos)
- Facturación / CFDI
- Sucursales múltiples (capacity excepcional, horarios)
- Permisos por rol más granulares
- Notificaciones push / SSE / WebSockets
