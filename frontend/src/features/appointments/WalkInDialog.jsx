import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Search, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { patientsApi } from "@/services/patientsApi";
import { appointmentsApi } from "@/services/appointmentsApi";

const BRANCH_ID = 1;

/**
 * Registro de paciente sin cita (walk-in).
 * REGLA: NO se pide doctor en este modal — el paciente queda en estado WALK_IN_WAITING
 * y recepción lo asigna después desde la sala de espera.
 *
 * Campos:
 *  - paciente (buscador)
 *  - motivo
 *  - observaciones (opcional)
 */
export default function WalkInDialog({ open, onOpenChange, onCreatePatient, onCreated }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef(null);

  // Reset al abrir
  useEffect(() => {
    if (!open) return;
    setQuery(""); setResults([]); setSelected(null);
    setReason(""); setNotes(""); setSubmitting(false);
  }, [open]);

  // Búsqueda con debounce
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await patientsApi.search({ page: 0, size: 8, query: query.trim() });
        setResults(Array.isArray(data?.content) ? data.content : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [query, open]);

  const canSubmit = !!selected && !submitting;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await appointmentsApi.walkIn({
        patientId: Number(selected.id),
        branchId: BRANCH_ID,
        doctorId: null,                 // siempre sin doctor — regla del negocio
        reason: reason.trim() || "Sin cita previa",
        // notes se podrían enviar pero el endpoint actual sólo soporta reason — keep simple
      });
      toast.success("Paciente sin cita registrado");
      onCreated?.(result);
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "No fue posible registrar al paciente sin cita");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateNew = () => {
    onOpenChange(false);
    setTimeout(() => onCreatePatient?.(), 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="walk-in-dialog">
        <DialogHeader>
          <DialogTitle>Paciente sin cita</DialogTitle>
          <DialogDescription>
            Quedará en la sala de espera. El doctor se asigna después desde &quot;En espera&quot;.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* Buscador */}
          <div className="space-y-2">
            <Label className="text-xs">Buscar paciente</Label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
                placeholder="Nombre, expediente, teléfono…"
                className="pl-9"
                data-testid="walkin-search"
              />
              {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />}
            </div>
            {results.length > 0 && !selected && (
              <div className="rounded-lg border border-border max-h-48 overflow-y-auto" data-testid="walkin-results">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelected(p)}
                    className="w-full text-left p-2.5 hover:bg-secondary/50 border-b border-border/60 last:border-0"
                    data-testid={`walkin-result-${p.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{p.fullName || "—"}</p>
                      <span className="text-[10px] font-mono text-muted-foreground">{p.expedientNumber || "—"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{p.phone || "—"}{p.email ? ` · ${p.email}` : ""}</p>
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs flex items-center justify-between" data-testid="walkin-selected">
                <span>
                  <span className="font-medium">{selected.fullName}</span> · <span className="font-mono">{selected.expedientNumber || "—"}</span>
                </span>
                <button
                  type="button"
                  className="text-[11px] underline text-muted-foreground hover:text-foreground"
                  onClick={() => { setSelected(null); setQuery(""); }}
                >
                  cambiar
                </button>
              </div>
            )}
            {query.trim().length >= 2 && !searching && results.length === 0 && !selected && (
              <button
                type="button"
                onClick={handleCreateNew}
                className="text-xs text-primary hover:underline flex items-center gap-1"
                data-testid="walkin-create-new"
              >
                <UserPlus size={12} /> No encuentro el paciente — crearlo
              </button>
            )}
          </div>

          {/* Motivo */}
          <div>
            <Label className="text-xs">Motivo</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. dolor agudo, revisión rápida…"
              className="mt-1"
              data-testid="walkin-reason"
            />
          </div>

          {/* Observaciones (opcional) */}
          <div>
            <Label className="text-xs">Observaciones (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas adicionales para el doctor…"
              rows={3}
              className="mt-1"
              data-testid="walkin-notes"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
            <Button type="submit" disabled={!canSubmit} data-testid="walkin-submit">
              {submitting ? <><Loader2 size={14} className="mr-1.5 animate-spin" /> Registrando…</> : "Registrar sin cita"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
