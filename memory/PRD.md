# Boss Dental Admin — PRD

## Original problem statement
Crear panel administrativo interno (frontend-only) para Boss Dental, separado de la web pública. Stack React + Tailwind + React Router + arquitectura modular (services, mocks, guards, layouts, features). Roles: ADMIN, RECEPCIONISTA, DENTISTA, PACIENTE. Login mock + JWT mock + sidebar dinámico por rol. Estilo Linear/Stripe/Notion. Tema claro + oscuro. Idioma español.

> Se decidió, con el usuario, adaptar el frontend existente (CRA) en `/app/frontend` en lugar de crear `/app/boss-dental-admin/` para que el panel sea visible en el preview.

## Architecture
- React 19 (CRA + craco) · React Router 7 · Tailwind · shadcn/ui · sonner · lucide-react · Geist (Google Fonts)
- Estructura: `constants/`, `mocks/`, `services/`, `context/`, `guards/`, `layouts/`, `shared/`, `features/{auth,dashboard,patients,appointments,leads,payments,treatments,doctors,activity,follow-ups,records,patient}`, `routes/`
- Mock JWT en localStorage. `services/data.service.js` Promise-based para futuro swap a REST/Spring.

## What's implemented (Feb 2026)
- Login premium con doble columna y tarjetas demo prellenadas.
- Layout admin con Sidebar dinámico por rol + Header (búsqueda, theme toggle, notificaciones).
- Tema claro/oscuro persistido en localStorage.
- Dashboard por rol (Admin/Recepcionista/Dentista/Paciente) con KPIs, secciones y datos mock.
- Páginas Admin: Pacientes (lista + detalle con tabs), Citas, Leads, Pagos, Tratamientos, Doctores, Actividad reciente.
- Páginas Recepcionista: Agenda (timeline diario), Seguimientos.
- Páginas Dentista: Mis citas, Mis pacientes, Expedientes, Tratamientos.
- Páginas Paciente: Próxima cita, Estado de cuenta, Presupuesto, Tratamiento (timeline), Carnet digital.
- Guards de ruta por rol y redirecciones.

## Beta 1.1 — Recepcionista (Feb 2026)
- `clinicStore` (useSyncExternalStore + localStorage) — estado mutable con expediente BD-2026-XXXX, sucursales (Ecatepec/La Villa), audit log persistente.
- Sidebar Recepcionista refinado: Dashboard, Agenda, Seguimientos, Pacientes, Registrar pago. Sin "Leads" (Leads sigue en Admin).
- Agenda con tabs: Diaria mejorada (filtro de sucursal, indicador de llegada, drawer con quick actions: marcar llegada, cambiar/asignar doctor, abrir expediente, atender, cancelar) + Mensual (carga visual Baja/Media/Alta/Saturada por día + drawer con resumen + crear cita en ese día).
- Estados ampliados: Pendiente, Confirmada, Llegó, En consulta, Atendida, Cancelada, Reprogramada.
- `CreateAppointmentDialog` — busca paciente existente (nombre/teléfono/expediente) o crea nuevo. Auto-genera expediente, carnet, cita, y pago **Pendiente** de $50 MXN.
- `RegisterPayment` — tabs Listado / Registrar nuevo. Confirma cargos pendientes con método de pago. Suma totalPaid y resta saldo. Auditoría en cada movimiento.
- `PatientDetail` ampliado: tabs Resumen, Carnet (visual premium), Citas, Tratamientos, **Cotización** (consulta auto-auditada + edición protegida con `AdminPasswordDialog` mock `Admin123` + motivo), Pagos, **Historial** (con chip toggle "Pagos" para filtrar eventos), Notas.
- `ChangeDoctorDialog` con motivo, reusable desde drawer y expediente.
- Persistencia en localStorage (`boss_dental_store`) — los pacientes/citas/pagos creados sobreviven al refresh. `clinicStore.resetDemo()` limpia y re-siembra.

## Beta 1.1 — Cierre (Feb 2026)
- **Cotización con items reales**: `QuotationEditor` con tabla editable (concepto, pieza, descripción, cant, precio, subtotal). Edición gated por `Admin123` + motivo, con auditoría completa.
- **Catálogo predictivo**: `procedureCatalog.js` + `appointmentReasons.js` con `Combobox` autocomplete. Soporta crear procedimientos/motivos nuevos persistidos en store y reutilizables.
- **Cotización inicial al crear cita**: bloque opcional dentro del `CreateAppointmentDialog` para definir tratamiento desde el primer contacto.
- **Cuestionario clínico de seguridad**: 3 preguntas + observaciones; flag `hasRisk` que bloquea visualmente con `patient-risk-banner`.
- **Pagos: tabla con columnas correctas** (Expediente/Paciente/Concepto/Monto/Método/Fecha de pago/Registrado por/Saldo restante/Estado/Acciones). Click en row → `/pacientes/:id?tab=payments&highlight={id}` con resaltado.
- **Cancelar pago** (`CancelPaymentDialog`): admin gated + motivo. No elimina; marca `Cancelado`, recalcula totalPaid/balance, line-through visual, badge.
- **Registrar pago desde expediente** (`RegisterPaymentDialog`) con resumen de saldo + cotización del paciente.
- **Reagendar/Cancelar citas desde expediente** (`RescheduleDialog` + `CancelAppointmentDialog`) con motivo obligatorio + auditoría.
- **Calendario mensual simplificado**: click en día → tab Diaria de esa fecha (sin drawer intermedio).
- **Navegación clickable**: nombres de paciente en Dashboard → expediente.
- **Últimos 5 pagos** en panel de resumen al registrar pago nuevo.
- 19/19 checks de Playwright (100%) en iteración 3.

## Backlog / Next
- P1: Modales reales para "Crear cita / Nuevo paciente / Registrar pago" (formularios mock con validación zod).
- P1: Búsqueda global Cmd+K (cmdk).
- P2: Conversión real Lead → Paciente, seguimiento WhatsApp, exportar PDF de presupuesto.
- P2: Adaptador `services/api.client.js` con axios + interceptor JWT para cuando exista el backend Spring Boot + PostgreSQL.
- P2: Notificaciones en tiempo real (mock o WebSocket).
