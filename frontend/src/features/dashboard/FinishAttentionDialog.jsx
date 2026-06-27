import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { appointmentLifecycleApi } from "@/services/appointmentLifecycleApi";

/**
 * Diálogo para finalizar la atención de una cita: pide notas opcionales y
 * llama a PUT /api/appointments/{id}/finish-attention.
 */
export default function FinishAttentionDialog({ appointment, open, onOpenChange, onFinished }) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!appointment?.appointmentId) return;
    setLoading(true);
    try {
      await appointmentLifecycleApi.finishAttention(appointment.appointmentId, notes.trim());
      toast.success("Atención finalizada");
      setNotes("");
      onFinished?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "No fue posible finalizar la atención");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="finish-attention-dialog">
        <DialogHeader>
          <DialogTitle>Finalizar atención</DialogTitle>
          <DialogDescription>
            {appointment?.patientName ? `Paciente: ${appointment.patientName}` : "Confirma la finalización de la atención."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Notas clínicas (opcional)</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observaciones, indicaciones, próximos pasos…"
            rows={5}
            data-testid="finish-notes-input"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange?.(false)} disabled={loading} data-testid="finish-cancel">
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={loading} data-testid="finish-confirm">
            {loading ? <><Loader2 size={14} className="mr-2 animate-spin" /> Finalizando…</> : "Finalizar atención"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
