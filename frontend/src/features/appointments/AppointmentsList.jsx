import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import PageHeader from "@/shared/PageHeader";
import DataTable from "@/shared/DataTable";
import StatusBadge from "@/shared/StatusBadge";
import { appointmentsApi } from "@/services/appointmentsApi";
import { todayISO } from "@/utils/scheduleTime";

/**
 * Listado simple de citas del día.
 *
 * Consume el backend real (`/appointments/schedule/day`). Sin datos mock.
 * Si no hay citas, muestra estado vacío real.
 */
export default function AppointmentsList({
  doctorId,
  title = "Citas del día",
  subtitle = "Citas registradas en la agenda del día de hoy.",
}) {
  const [date, setDate] = useState(todayISO());
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    appointmentsApi
      .scheduleDay({ date, branchId: 1, dentistId: doctorId || null })
      .then((data) => { if (!cancelled) setItems(Array.isArray(data) ? data : []); })
      .catch((e) => { if (!cancelled) setError(e?.response?.data?.detail || "No fue posible cargar las citas"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date, doctorId]);

  const rows = items.map((a) => ({
    id: a.appointmentId ?? a.id,
    date: a.appointmentDate || date,
    time: (a.startTime || a.horaProgramada || "").slice(0, 5) || "—",
    patientName: a.patientName || a.patient?.fullName || "—",
    doctorName: a.doctorAsignadoName || a.doctorName || "Sin asignar",
    type: a.reason || "—",
    duration: a.endTime && a.startTime
      ? `${diffMin(a.startTime, a.endTime)} min`
      : "—",
    status: a.statusCode,
    statusName: a.statusName,
    statusColor: a.statusColor,
    walkIn: a.walkIn,
  }));

  const columns = [
    { key: "time", label: "Hora", render: (a) => <span className="font-mono">{a.time}</span> },
    { key: "patientName", label: "Paciente", render: (a) => <span className="font-medium">{a.patientName}</span> },
    { key: "doctorName", label: "Doctor" },
    { key: "type", label: "Motivo" },
    { key: "duration", label: "Duración" },
    {
      key: "status",
      label: "Estado",
      render: (a) => <StatusBadge appointment={{ statusCode: a.status, statusName: a.statusName, statusColor: a.statusColor, walkIn: a.walkIn }} size="xs" />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            data-testid="appointments-date"
          />
        }
      />

      {loading && (
        <div className="rounded-xl border border-border p-6 flex items-center justify-center text-sm text-muted-foreground" data-testid="appointments-loading">
          <Loader2 size={14} className="animate-spin mr-2" /> Cargando citas…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 p-4 text-sm text-rose-600 dark:text-rose-300" data-testid="appointments-error">
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground" data-testid="appointments-empty">
          No hay citas para esta fecha.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <DataTable
          testId="appointments-table"
          data={rows}
          columns={columns}
          searchKeys={["patientName", "doctorName", "type"]}
          searchPlaceholder="Buscar por paciente, doctor, motivo…"
        />
      )}
    </div>
  );
}

function diffMin(a, b) {
  const t = (s) => {
    const [h, m] = s.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  return Math.max(0, t(b) - t(a));
}
