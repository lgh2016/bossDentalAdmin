import { useEffect, useState } from "react";
import { Plus, Calendar, CalendarRange, UserPlus2 } from "lucide-react";
import PageHeader from "@/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import AgendaDaily from "./AgendaDaily";
import AgendaMonthly from "./AgendaMonthly";
import CreateAppointmentDialog from "./CreateAppointmentDialog";
import WalkInDialog from "./WalkInDialog";
import { doctorsApi } from "@/services/doctorsApi";

const BRANCH_ID = 1;
const ALL_DOCTORS_VALUE = "ALL";

export default function Agenda() {
  const [tab, setTab] = useState("daily");
  const [createOpen, setCreateOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [createDefaultDate, setCreateDefaultDate] = useState();
  const [dailyDate, setDailyDate] = useState(new Date());
  const [agendaRefreshKey, setAgendaRefreshKey] = useState(0);

  // Filtro de doctores compartido entre vista Diaria y Mensual
  const [doctors, setDoctors] = useState([]);
  const [selectedDentistKey, setSelectedDentistKey] = useState(ALL_DOCTORS_VALUE);
  const dentistId = selectedDentistKey === ALL_DOCTORS_VALUE ? null : Number(selectedDentistKey);

  useEffect(() => {
    const ctrl = new AbortController();
    doctorsApi.listActive({ branchId: BRANCH_ID, signal: ctrl.signal })
      .then((data) => setDoctors(Array.isArray(data) ? data : []))
      .catch((err) => {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError" || err?.name === "AbortError") return;
        setDoctors([]); toast.error("No fue posible cargar los doctores");
      });
    return () => ctrl.abort();
  }, []);

  const openCreate = (date) => {
    if (typeof date === "string") setCreateDefaultDate(date);
    setCreateOpen(true);
  };

  const goToDaily = (date) => {
    setDailyDate(date instanceof Date ? date : new Date(date));
    setTab("daily");
  };

  const FilterCombo = (
    <Select value={selectedDentistKey} onValueChange={setSelectedDentistKey}>
      <SelectTrigger className="h-8 w-52 text-xs" data-testid="agenda-doctor-filter">
        <SelectValue placeholder="Todos los doctores" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_DOCTORS_VALUE}>Todos los doctores</SelectItem>
        {doctors.map((d) => (
          <SelectItem key={d.id} value={String(d.id)}>
            {d.fullName || `${d.name || ""} ${d.lastName || ""}`.trim()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recepción"
        title="Agenda"
        subtitle="Gestiona la agenda diaria, walk-ins y revisa la carga mensual."
        actions={
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setWalkInOpen(true)} data-testid="agenda-walkin-top">
              <UserPlus2 size={14} className="mr-1" /> Sin cita
            </Button>
            <Button type="button" onClick={() => openCreate()} data-testid="agenda-create-top">
              <Plus size={14} className="mr-1" /> Crear cita
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-secondary">
          <TabsTrigger value="daily" data-testid="tab-agenda-daily"><Calendar size={13} className="mr-1.5" /> Diaria</TabsTrigger>
          <TabsTrigger value="monthly" data-testid="tab-agenda-monthly"><CalendarRange size={13} className="mr-1.5" /> Mensual</TabsTrigger>
        </TabsList>
        <TabsContent value="daily" className="mt-4">
          {tab === "daily" && (
            <AgendaDaily
              key={`daily-${agendaRefreshKey}`}
              branchId={BRANCH_ID}
              dentistId={dentistId}
              controlledDate={dailyDate}
              onDateChange={setDailyDate}
              filterSlot={FilterCombo}
            />
          )}
        </TabsContent>
        <TabsContent value="monthly" className="mt-4">
          {tab === "monthly" && (
            <AgendaMonthly
              branchId={BRANCH_ID}
              dentistId={dentistId}
              onOpenDay={goToDaily}
              filterSlot={FilterCombo}
            />
          )}
        </TabsContent>
      </Tabs>

      <CreateAppointmentDialog
        open={createOpen}
        onOpenChange={(o) => { setCreateOpen(o); if (!o) setAgendaRefreshKey((k) => k + 1); }}
        defaultDate={createDefaultDate}
        onCreated={(created) => {
          // Salta a la fecha de la cita creada para mostrarla en vivo
          if (created?.appointmentDate) {
            const [y, m, d] = created.appointmentDate.split("-").map(Number);
            setDailyDate(new Date(y, (m || 1) - 1, d || 1));
          }
          setTab("daily");
          setAgendaRefreshKey((k) => k + 1);
        }}
      />
      <WalkInDialog
        open={walkInOpen}
        onOpenChange={setWalkInOpen}
        onCreatePatient={() => { setCreateDefaultDate(undefined); setCreateOpen(true); }}
        onCreated={() => {
          // Forzar refresco de agenda diaria para mostrar el walk-in
          setDailyDate(new Date());
          setTab("daily");
          setAgendaRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
