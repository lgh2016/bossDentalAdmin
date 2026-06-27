import { useCallback, useEffect, useState } from "react";
import { Loader2, FileText, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { patientsApi } from "@/services/patientsApi";
import { useAuth } from "@/context/AuthContext";
import { ROLES } from "@/constants/roles";

const ROLE_LABEL = {
  ADMIN: "Admin",
  RECEPTION: "Recepción",
  RECEPCIONISTA: "Recepción",
  DENTIST: "Dentista",
  DENTISTA: "Dentista",
};

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-MX", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function PatientNotes({ patientId, onNoteAdded }) {
  const { user } = useAuth();
  const role = (user?.role || "").toUpperCase();
  // Sólo roles internos pueden crear notas. El rol PACIENTE no.
  const canCreate = role && role !== ROLES.PACIENTE?.toUpperCase();

  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await patientsApi.listNotes(patientId);
      setNotes(list);
    } catch (err) {
      setError(err?.response?.data?.detail || "No fue posible cargar las notas");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { if (patientId) reload(); }, [patientId, reload]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = content.trim();
    if (!text) { toast.error("La nota no puede estar vacía"); return; }
    setSubmitting(true);
    try {
      await patientsApi.createNote(patientId, text);
      toast.success("Nota guardada");
      setContent("");
      await reload();
      onNoteAdded?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "No fue posible guardar la nota");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="patient-notes">
      {canCreate ? (
        <form onSubmit={handleSubmit} className="rounded-xl border border-border p-4 space-y-3" data-testid="patient-notes-form">
          <div className="flex items-center gap-2 text-sm font-medium">
            <StickyNote size={14} /> Nueva nota
          </div>
          <div>
            <Label htmlFor="note-content" className="text-xs sr-only">Contenido</Label>
            <Textarea
              id="note-content"
              data-testid="note-content-input"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Escribe una observación clínica, indicación o nota administrativa…"
              className="min-h-[90px]"
              maxLength={4000}
              disabled={submitting}
            />
            <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
              <span>{content.length}/4000</span>
              <span>Visible solo dentro del expediente.</span>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              data-testid="note-submit"
              disabled={submitting || !content.trim()}
            >
              {submitting ? <><Loader2 size={14} className="mr-1.5 animate-spin" /> Guardando…</> : "Guardar nota"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground" data-testid="patient-notes-readonly">
          Tu rol no puede registrar notas en este expediente.
        </div>
      )}

      <div className="rounded-xl border border-border" data-testid="patient-notes-list">
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <FileText size={12} /> Notas registradas {notes.length > 0 && <span className="font-mono">· {notes.length}</span>}
        </div>
        {loading && (
          <p className="p-6 text-sm text-muted-foreground text-center"><Loader2 size={14} className="inline mr-2 animate-spin" /> Cargando notas…</p>
        )}
        {!loading && error && (
          <p className="p-6 text-sm text-rose-600" data-testid="patient-notes-error">{error}</p>
        )}
        {!loading && !error && notes.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground text-center" data-testid="patient-notes-empty">
            Aún no hay notas en este expediente.
          </p>
        )}
        {!loading && !error && notes.length > 0 && (
          <ul className="divide-y divide-border">
            {notes.map((n) => (
              <li key={n.id} className="p-4 space-y-1.5" data-testid={`note-item-${n.id}`}>
                <p className="text-sm whitespace-pre-wrap break-words">{n.content}</p>
                <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-medium text-foreground/80">{n.authorName || "Usuario"}</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-secondary text-[10px] font-medium uppercase tracking-wide">
                    {ROLE_LABEL[n.authorRole] || n.authorRole || "—"}
                  </span>
                  <span className="font-mono">{formatDateTime(n.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
