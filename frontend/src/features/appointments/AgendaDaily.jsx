import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/shared/StatusBadge";
import { formatDateLong } from "@/utils/format";
import { appointmentsApi } from "@/services/appointmentsApi";
import { effectiveDoctor } from "@/utils/appointmentStatus";
import AppointmentDrawer from "./AppointmentDrawer";

const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i); // 08..18
const PX_PER_MIN = 96 / 60; // 96px = 60 min slot
const TIMELINE_HEIGHT = HOURS.length * 96; // 11 * 96 = 1056px

const trimSec = (t) => (t ? String(t).slice(0, 5) : "");
// Fecha local en formato YYYY-MM-DD (NO UTC) — evita desfase de día.
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function toMinutes(t) {
  const s = trimSec(t);
  if (!s) return 0;
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function durationMinutes(start, end) {
  const s = toMinutes(start);
  const e = end ? toMinutes(end) : s + 30;
  return Math.max(15, e - s);
}

/**
 * Lane allocation: para citas que se traslapan en una columna, asignar carriles
 * horizontales para que ninguna se enciome con otra.
 */
function assignLanes(items) {
  const enriched = items
    .map((a) => ({
      ...a,
      _start: toMinutes(a.startTime),
      _end: toMinutes(a.endTime) || toMinutes(a.startTime) + durationMinutes(a.startTime, a.endTime),
    }))
    .sort((a, b) => a._start - b._start || a._end - b._end);

  // 1ª pasada: lane individual (lowest free lane)
  enriched.forEach((a, i) => {
    const used = new Set();
    for (let j = 0; j < i; j++) {
      const b = enriched[j];
      if (b._start < a._end && a._start < b._end) used.add(b._lane);
    }
    let lane = 0;
    while (used.has(lane)) lane++;
    a._lane = lane;
  });

  // 2ª pasada: total de lanes en el grupo de overlap
  enriched.forEach((a, i) => {
    let maxLane = a._lane;
    for (let j = 0; j < enriched.length; j++) {
      if (i === j) continue;
      const b = enriched[j];
      if (b._start < a._end && a._start < b._end) maxLane = Math.max(maxLane, b._lane);
    }
    a._lanes = maxLane + 1;
  });

  return enriched;
}

export default function AgendaDaily({ branchId = 1, dentistId, controlledDate, onDateChange, filterSlot }) {
  const [internalDate, setInternalDate] = useState(new Date());
  const date = controlledDate || internalDate;
  const setDate = (d) => { if (onDateChange) onDateChange(d); else setInternalDate(d); };

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const abortRef = useRef(null);
  const reqIdRef = useRef(0);

  const iso = isoOf(date);

  useEffect(() => {
    // Cancelar request en curso ANTES de limpiar el estado (evita resultados viejos)
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const reqId = ++reqIdRef.current;

    // LIMPIAR la lista inmediatamente para que no se mezclen citas anteriores
    setItems([]);
    setError(null);
    setLoading(true);

    (async () => {
      try {
        const res = await appointmentsApi.scheduleDay({ date: iso, branchId, dentistId, signal: ctrl.signal });
        // Sólo aplicar si esta sigue siendo la petición vigente
        if (reqId !== reqIdRef.current) return;
        setItems(Array.isArray(res) ? res : []);
      } catch (err) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError" || ctrl.signal.aborted) return;
        if (reqId !== reqIdRef.current) return;
        setError("No fue posible cargar la agenda del día.");
        setItems([]);
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    })();

    return () => ctrl.abort();
  }, [iso, branchId, dentistId]);

  const shift = (d) => { const next = new Date(date); next.setDate(next.getDate() + d); setDate(next); };

  /**
   * Agrupamiento:
   *  - Si dentistId está seleccionado → 1 columna del doctor seleccionado
   *  - Si "Todos" → 1 columna por doctor con citas. "Sin asignar" sale como sección aparte.
   */
  const { columns, unassigned, counters } = useMemo(() => {
    // Counters según el nuevo modelo de negocio:
    //   Sin asignar = citas (CONFIRMED/ARRIVED) que NO tienen doctor asignado (no walk-in)
    //   En espera   = ARRIVED_WAITING (scheduled llegado sin doctor) + WALK_IN_WAITING (walk-in sin doctor)
    //                 + ASSIGNED scheduled (cita llegada con doctor pero aún no en atención)
    //   Sin cita    = TOTAL de walk-ins del día (con o sin doctor) — el flujo operativo del walk-in.
    //   En atención = IN_PROGRESS + scheduled ARRIVED con doctor + walk-ins ARRIVED con doctor (ASSIGNED).
    const counts = { sinAsignar: 0, enEspera: 0, sinCita: 0, enAtencion: 0, atendidas: 0 };
    items.forEach((a) => {
      const isUnassigned = a.doctorAsignado == null;
      const sc = a.statusCode;
      const isWalkIn = a.walkIn === true;
      // Sin asignar (sólo agendadas — los walk-ins van en "Sin cita")
      if (isUnassigned && !isWalkIn && ["CONFIRMED", "ARRIVED"].includes(sc)) counts.sinAsignar += 1;
      // En espera
      if (sc === "ARRIVED" && isUnassigned) counts.enEspera += 1;
      // Sin cita (TODOS los walk-ins del día, asignados o no)
      if (isWalkIn && !["CANCELLED", "COMPLETED", "ATTENDED", "NO_SHOW"].includes(sc)) counts.sinCita += 1;
      // En atención (cualquier IN_PROGRESS; o ARRIVED con doctor asignado — incluye walk-ins asignados)
      if (sc === "IN_PROGRESS" || (sc === "ARRIVED" && !isUnassigned)) counts.enAtencion += 1;
      if (["COMPLETED", "ATTENDED"].includes(sc)) counts.atendidas += 1;
    });

    if (dentistId != null) {
      const sorted = assignLanes(items);
      const name = sorted.find((a) => effectiveDoctor(a).id != null)?.dentistName || "Doctor";
      return { columns: [{ key: String(dentistId), dentistId, dentistName: name, items: sorted }], unassigned: [], counters: counts };
    }

    // Vista "Todos": columnas SOLO por doctor (asignado). "Sin asignar" va a sidebar.
    const groups = new Map();
    const sin = [];
    items.forEach((a) => {
      const eff = effectiveDoctor(a);
      if (eff.id == null) { sin.push(a); return; }
      const key = `d-${eff.id}`;
      if (!groups.has(key)) {
        groups.set(key, { key, dentistId: eff.id, dentistName: eff.name || "Doctor", items: [] });
      }
      groups.get(key).items.push(a);
    });
    const arr = [...groups.values()]
      .map((g) => ({ ...g, items: assignLanes(g.items) }))
      .sort((a, b) => (a.dentistName || "").localeCompare(b.dentistName || ""));
    return { columns: arr, unassigned: sin, counters: counts };
  }, [items, dentistId]);

  const isActuallyToday = iso === isoOf(new Date());

  return (
    <>
      {/* Panel superior de operación */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" data-testid="agenda-counters">
        <CounterCard label="Sin asignar" value={counters.sinAsignar} tone="slate" testId="counter-sin-asignar" />
        <CounterCard label="En espera" value={counters.enEspera} tone="amber" testId="counter-en-espera" />
        <CounterCard label="Sin cita" value={counters.sinCita} tone="violet" testId="counter-sin-cita" />
        <CounterCard label="En atención" value={counters.enAtencion} tone="sky" testId="counter-en-atencion" />
      </div>

      <div className="grid lg:grid-cols-[280px_1fr] gap-4 items-start">
        {/* Sección lateral: Sin asignar / Sin cita / En espera */}
        <UnassignedSidebar items={items} onSelect={setSelectedId} />

        {/* Calendario */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => shift(-1)} data-testid="agenda-prev"><ChevronLeft size={14} /></Button>
              <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => shift(1)} data-testid="agenda-next"><ChevronRight size={14} /></Button>
              <Button
                type="button"
                variant={isActuallyToday ? "default" : "ghost"}
                size="sm"
                onClick={() => setDate(new Date())}
                disabled={isActuallyToday}
                data-testid="agenda-today"
              >Hoy</Button>
              <span className="text-sm font-medium capitalize ml-2" data-testid="agenda-current-date">{formatDateLong(iso)}</span>
              {loading && <Loader2 size={14} className="ml-2 animate-spin text-muted-foreground" />}
            </div>
            {filterSlot}
          </div>

          {error && <p className="px-4 py-3 text-sm text-rose-500" data-testid="agenda-error">{error}</p>}

          {!loading && !error && items.length === 0 && (
            <p className="px-4 py-10 text-sm text-muted-foreground text-center" data-testid="agenda-empty">Sin citas para esta fecha.</p>
          )}

          {columns.length > 0 && (
            <div className="overflow-x-auto">
              <div
                className="grid divide-x divide-border min-w-full"
                style={{ gridTemplateColumns: `64px repeat(${columns.length}, minmax(220px, 1fr))` }}
              >
                <div className="bg-secondary/40 border-b border-border" />
                {columns.map((c) => (
                  <div
                    key={c.key}
                    className="px-3 py-2.5 bg-secondary/40 border-b border-border text-xs font-medium truncate"
                    title={c.dentistName}
                    data-testid={`agenda-col-${c.key}`}
                  >
                    {c.dentistName}
                  </div>
                ))}

                <div style={{ height: TIMELINE_HEIGHT }}>
                  {HOURS.map((h) => (
                    <div key={h} className="h-24 px-2 text-[11px] text-muted-foreground border-b border-border/60 last:border-0 pt-1">
                      {String(h).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>

                {columns.map((c) => (
                  <div key={c.key} className="relative border-l border-border/60" style={{ height: TIMELINE_HEIGHT }}>
                    {HOURS.map((h) => (
                      <div key={h} className="h-24 border-b border-border/60 last:border-0" />
                    ))}
                    {c.items.map((a) => {
                      const startMin = toMinutes(a.startTime);
                      const dur = durationMinutes(a.startTime, a.endTime);
                      const rawTop = (startMin - 8 * 60) * PX_PER_MIN;
                      const top = Math.max(0, Math.min(rawTop, TIMELINE_HEIGHT - 54));
                      const height = Math.max(54, dur * PX_PER_MIN);
                      const lane = a._lane || 0;
                      const lanes = a._lanes || 1;
                      const widthPct = 100 / lanes;
                      const leftPct = lane * widthPct;
                      const eff = effectiveDoctor(a);
                      const expedient = a.patientExpedient || (a.patientId ? `EXP-${a.patientId}` : "—");
                      return (
                        <AppointmentCard
                          key={a.appointmentId}
                          appointment={a}
                          expedient={expedient}
                          doctorLabel={eff.name}
                          style={{
                            top,
                            height,
                            left: `calc(${leftPct}% + 6px)`,
                            width: `calc(${widthPct}% - 12px)`,
                          }}
                          onSelect={() => setSelectedId(a.appointmentId)}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <AppointmentDrawer
        open={!!selectedId}
        onOpenChange={(v) => !v && setSelectedId(null)}
        appointmentId={selectedId}
        onChanged={() => {
          if (abortRef.current) abortRef.current.abort();
          const ctrl = new AbortController();
          abortRef.current = ctrl;
          const reqId = ++reqIdRef.current;
          appointmentsApi.scheduleDay({ date: iso, branchId, dentistId, signal: ctrl.signal })
            .then((res) => { if (reqId === reqIdRef.current) setItems(Array.isArray(res) ? res : []); })
            .catch(() => {});
        }}
      />
    </>
  );
}

function CounterCard({ label, value, tone, testId }) {
  const TONES = {
    slate: "bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-slate-500/20",
    amber: "bg-amber-500/12 text-amber-800 dark:text-amber-300 ring-amber-500/25",
    violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-500/20",
    sky: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/20",
  };
  return (
    <div className={`rounded-xl ring-1 ring-inset px-4 py-3 ${TONES[tone] || TONES.slate}`} data-testid={testId}>
      <p className="text-[11px] uppercase tracking-wide font-medium opacity-80">{label}</p>
      <p className="text-2xl font-semibold mt-0.5">{value}</p>
    </div>
  );
}

function UnassignedSidebar({ items, onSelect }) {
  // Citas (no walk-in) sin doctor en cualquier estado abierto.
  const sinAsignar = items.filter((a) =>
    !a.walkIn && a.doctorAsignado == null && ["CONFIRMED", "ARRIVED"].includes(a.statusCode),
  );
  // Walk-ins separados por estado de asignación.
  const walkInPending = items.filter((a) => a.walkIn && a.doctorAsignado == null && a.statusCode === "ARRIVED");
  const walkInAssigned = items.filter((a) =>
    a.walkIn && a.doctorAsignado != null && ["ARRIVED", "IN_PROGRESS"].includes(a.statusCode),
  );

  if (sinAsignar.length === 0 && walkInPending.length === 0 && walkInAssigned.length === 0) {
    return (
      <aside className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground text-center lg:sticky lg:top-4" data-testid="agenda-sidebar-empty">
        Sin pacientes en espera ni operativos hoy.
      </aside>
    );
  }

  return (
    <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto" data-testid="agenda-sidebar">
      {walkInPending.length > 0 && (
        <CollapsibleGroup title="Sin cita · pendientes" count={walkInPending.length} testId="sidebar-walkin-pending" defaultOpen>
          {(filter) => walkInPending
            .filter((a) => matchFilter(a, filter))
            .map((a) => <SidebarItem key={a.appointmentId} appointment={a} onSelect={onSelect} />)}
        </CollapsibleGroup>
      )}
      {walkInAssigned.length > 0 && (
        <CollapsibleGroup title="Sin cita · asignados" count={walkInAssigned.length} testId="sidebar-walkin-assigned" defaultOpen>
          {(filter) => walkInAssigned
            .filter((a) => matchFilter(a, filter))
            .map((a) => <SidebarItem key={a.appointmentId} appointment={a} onSelect={onSelect} />)}
        </CollapsibleGroup>
      )}
      {sinAsignar.length > 0 && (
        <CollapsibleGroup title="Pacientes citados · sin asignar" count={sinAsignar.length} testId="sidebar-sin-asignar" defaultOpen>
          {(filter) => (
            <TimeGroupedItems
              items={sinAsignar.filter((a) => matchFilter(a, filter))}
              onSelect={onSelect}
            />
          )}
        </CollapsibleGroup>
      )}
    </aside>
  );
}

/**
 * Agrupa citas por hora (HH:mm) y las muestra bajo un encabezado de hora.
 * Orden ascendente. Conserva la búsqueda recibida desde CollapsibleGroup.
 */
function TimeGroupedItems({ items, onSelect }) {
  // Agrupa por startTime normalizado a HH:mm (fallback "Sin hora")
  const groups = useMemo(() => {
    const map = new Map();
    items.forEach((a) => {
      const t = trimSec(a.startTime || a.horaProgramada) || "Sin hora";
      if (!map.has(t)) map.set(t, []);
      map.get(t).push(a);
    });
    // Orden por hora ascendente; "Sin hora" al final.
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "Sin hora") return 1;
      if (b === "Sin hora") return -1;
      return toMinutes(a) - toMinutes(b);
    });
  }, [items]);

  if (items.length === 0) {
    return <p className="px-3 py-3 text-[11px] text-muted-foreground" data-testid="sidebar-sin-asignar-empty">Sin resultados.</p>;
  }
  return groups.map(([time, group], idx) => (
    <div key={time} data-testid={`sidebar-time-group-${time}`}>
      <div
        className={`px-3 py-2.5 bg-secondary/40 sticky top-0 z-10 ${idx > 0 ? "border-t-2 border-border" : ""}`}
        data-testid={`sidebar-time-header-${time}`}
      >
        <div className="text-base font-semibold font-mono tracking-tight text-foreground leading-tight">{time}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {group.length} {group.length === 1 ? "paciente" : "pacientes"}
        </div>
      </div>
      {group.map((a) => (
        <SidebarItem key={a.appointmentId} appointment={a} onSelect={onSelect} />
      ))}
    </div>
  ));
}

function matchFilter(a, filter) {
  if (!filter) return true;
  const f = filter.toLowerCase();
  return (a.patientName || "").toLowerCase().includes(f)
    || (a.patientExpedient || "").toLowerCase().includes(f)
    || (a.reason || "").toLowerCase().includes(f);
}

function CollapsibleGroup({ title, count, children, testId, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const [filter, setFilter] = useState("");
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wide font-medium text-muted-foreground hover:bg-secondary/40 transition-colors"
        data-testid={`${testId}-toggle`}
      >
        <span className="flex items-center gap-2">
          <span>{title}</span>
          <span className="px-1.5 py-0.5 rounded-full bg-secondary text-foreground/70 text-[10px] font-mono">{count}</span>
        </span>
        <span className="text-[10px]">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <>
          <div className="px-2.5 py-1.5 border-t border-border/60 bg-secondary/20">
            <div className="relative">
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Buscar…"
                className="w-full bg-background rounded-md border border-border pl-7 pr-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/30"
                data-testid={`${testId}-search`}
              />
            </div>
          </div>
          <div className="divide-y divide-border/60 max-h-72 overflow-y-auto">
            {children(filter)}
          </div>
        </>
      )}
    </div>
  );
}

function SidebarItem({ appointment, onSelect }) {
  const a = appointment;
  const exp = a.patientExpedient || (a.patientId ? `EXP-${a.patientId}` : "—");
  // Etiqueta de asignación (sólo cuando hay doctor asignado)
  const doctorLabel = (() => {
    if (a.doctorAsignado == null) return null;
    const dn = a.doctorAsignadoName || a.doctorName || "doctor";
    if (a.statusCode === "IN_PROGRESS") return `En atención con ${dn}`;
    if (a.statusCode === "ARRIVED") return `Asignado a ${dn}`;
    return `Con ${dn}`;
  })();
  const isAssignedWalkIn = a.walkIn && a.doctorAsignado != null;
  return (
    <button
      type="button"
      onClick={() => onSelect(a.appointmentId)}
      className="w-full text-left px-3 py-2 hover:bg-secondary/50 transition-colors flex items-start gap-2"
      data-testid={`sidebar-appt-${a.appointmentId}`}
      title={`${a.patientName} · ${exp}`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium truncate">{a.patientName || "Paciente"}</p>
        <p className="text-[10px] font-mono text-muted-foreground truncate">
          {exp}{a.horaLlegada ? ` · llegó ${a.horaLlegada.slice(0,5)}` : ""}
        </p>
        {doctorLabel && (
          <p
            className={`text-[10px] mt-0.5 truncate ${a.statusCode === "IN_PROGRESS"
              ? "text-sky-700 dark:text-sky-300 font-medium"
              : "text-blue-700 dark:text-blue-300"}`}
            data-testid={`sidebar-assignment-${a.appointmentId}`}
          >
            {doctorLabel}
          </p>
        )}
      </div>
      {isAssignedWalkIn ? (
        <span
          className={`text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded-full ring-1 ring-inset whitespace-nowrap ${a.statusCode === "IN_PROGRESS"
            ? "bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/25"
            : "bg-blue-500/12 text-blue-700 dark:text-blue-300 ring-blue-500/25"}`}
        >
          {a.statusCode === "IN_PROGRESS" ? "En atención" : "Asignado"}
        </span>
      ) : (
        <StatusBadge appointment={a} size="xs" />
      )}
    </button>
  );
}

function AppointmentCard({ appointment, expedient, doctorLabel, style, onSelect }) {
  const a = appointment;
  const start = trimSec(a.startTime);
  const isWalkIn = a.walkIn === true;
  const fullTooltip = `${a.patientName || "Paciente"} · ${expedient}${start ? ` · ${start}` : ""}${doctorLabel ? ` · ${doctorLabel}` : ""}${a.reason ? ` · ${a.reason}` : ""}`;

  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`appt-card-${a.appointmentId}`}
      className="absolute text-left rounded-md border bg-card hover:shadow-md transition-shadow border-primary/25 hover:border-primary/40 overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary/40"
      style={style}
      title={fullTooltip}
    >
      <div className="h-full w-full p-1.5 flex flex-col gap-0.5">
        <div className="flex items-start justify-between gap-1 min-w-0">
          <p className="text-[11px] font-semibold leading-tight truncate flex-1 min-w-0">{a.patientName || "Paciente"}</p>
          <StatusBadge appointment={a} size="xs" />
        </div>
        <p className="text-[10px] font-mono text-muted-foreground truncate">{expedient}</p>
        {start && <p className="text-[10px] text-muted-foreground truncate">{start}{a.endTime ? `–${trimSec(a.endTime)}` : ""}</p>}
        {isWalkIn && (
          <span className="text-[9px] uppercase tracking-wide font-medium text-violet-700 dark:text-violet-300 mt-auto">Atención operativa</span>
        )}
      </div>
    </button>
  );
}
