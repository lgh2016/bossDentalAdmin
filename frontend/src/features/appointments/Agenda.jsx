import { useState } from "react";
import { Plus, Calendar, CalendarRange } from "lucide-react";
import PageHeader from "@/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AgendaDaily from "./AgendaDaily";
import AgendaMonthly from "./AgendaMonthly";
import CreateAppointmentDialog from "./CreateAppointmentDialog";

export default function Agenda() {
  const [tab, setTab] = useState("daily");
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaultDate, setCreateDefaultDate] = useState();
  const [dailyDate, setDailyDate] = useState(new Date());

  const openCreate = (date) => {
    if (typeof date === "string") setCreateDefaultDate(date);
    setCreateOpen(true);
  };

  const goToDaily = (date) => {
    setDailyDate(date instanceof Date ? date : new Date(date));
    setTab("daily");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recepción"
        title="Agenda"
        subtitle="Gestiona la agenda diaria y revisa la carga mensual de la clínica."
        actions={<Button onClick={() => openCreate()} data-testid="agenda-create-top"><Plus size={14} className="mr-1" /> Crear cita</Button>}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-secondary">
          <TabsTrigger value="daily" data-testid="tab-agenda-daily"><Calendar size={13} className="mr-1.5" /> Diaria</TabsTrigger>
          <TabsTrigger value="monthly" data-testid="tab-agenda-monthly"><CalendarRange size={13} className="mr-1.5" /> Mensual</TabsTrigger>
        </TabsList>
        <TabsContent value="daily" className="mt-4">
          <AgendaDaily onCreate={openCreate} controlledDate={dailyDate} onDateChange={setDailyDate} />
        </TabsContent>
        <TabsContent value="monthly" className="mt-4">
          <AgendaMonthly onCreate={openCreate} onOpenDay={goToDaily} />
        </TabsContent>
      </Tabs>

      <CreateAppointmentDialog open={createOpen} onOpenChange={setCreateOpen} defaultDate={createDefaultDate} />
    </div>
  );
}
