import { useEffect, useState } from "react";
import { Plus, Calendar, CalendarRange } from "lucide-react";
import PageHeader from "@/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import AgendaDaily from "./AgendaDaily";
import AgendaMonthly from "./AgendaMonthly";
import CreateAppointmentDialog from "./CreateAppointmentDialog";
import { doctorsApi } from "@/services/doctorsApi";

const BRANCH_ID = 1;
const ALL_DOCTORS_VALUE = "ALL";

export default function Agenda() {
  const [tab, setTab] = useState("daily");
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaultDate, setCreateDefaultDate] = useState();
  const [dailyDate, setDailyDate] = useState(new Date());

  // Filtro de doctores compartido entre vista Diaria y Mensual
  const [doctors, setDoctors] = useState([]);
  const [selectedDentistKey, setSelectedDentistKey] = useState(ALL_DOCTORS_VALUE);
  // dentistId real (null = "todos"); se calcula desde la opción seleccionada
  const dentistId = selectedDentistKey === ALL_DOCTORS_VALUE ? null : Number(selectedDentistKey);

  // Lazy load: cargar doctores sólo cuando entremos a Agenda
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await doctorsApi.listActive({ branchId: BRANCH_ID });
        if (!cancelled) setDoctors(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) {
          setDoctors([]);
          toast.error("No fue posible cargar los doctores");
        }
      }
    })();
    return () => { cancelled = true; };
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
        subtitle="Gestiona la agenda diaria y revisa la carga mensual de la clínica."
        actions={
          <Button onClick={() => openCreate()} data-testid="agenda-create-top">
            <Plus size={14} className="mr-1" /> Crear cita
          </Button>
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

      <CreateAppointmentDialog open={createOpen} onOpenChange={setCreateOpen} defaultDate={createDefaultDate} />
    </div>
  );
}
