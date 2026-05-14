import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const QUESTIONS = [
  { key: "allergies", q: "¿Tiene alergias a medicamentos o anestesia?" },
  { key: "chronic", q: "¿Padece presión alta, diabetes o alguna enfermedad crónica?" },
  { key: "medications", q: "¿Está tomando medicamentos actualmente?" },
];

export const emptyQuestionnaire = () => ({
  allergies: { answer: null, note: "" },
  chronic: { answer: null, note: "" },
  medications: { answer: null, note: "" },
});

export const hasRisk = (q) => Object.values(q || {}).some((x) => x?.answer === true);

export default function MedicalQuestionnaire({ value, onChange }) {
  const [v, setV] = useState(value || emptyQuestionnaire());

  const update = (key, patch) => {
    const next = { ...v, [key]: { ...v[key], ...patch } };
    setV(next);
    onChange?.(next);
  };

  const risk = hasRisk(v);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4" data-testid="medical-questionnaire">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Cuestionario rápido de seguridad</p>
          <p className="text-xs text-muted-foreground">3 preguntas mínimas para identificar riesgos clínicos.</p>
        </div>
        {risk && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20 px-2 py-0.5 text-[11px] font-medium" data-testid="questionnaire-risk-badge">
            <ShieldAlert size={11} /> Requiere revisión clínica
          </span>
        )}
      </div>

      {QUESTIONS.map((q) => {
        const ans = v[q.key]?.answer;
        return (
          <div key={q.key} className="space-y-2 border-t border-border pt-3 first:border-0 first:pt-0">
            <Label className="text-xs">{q.q}</Label>
            <div className="flex gap-2">
              {[
                { val: true, label: "Sí" },
                { val: false, label: "No" },
              ].map((opt) => (
                <button
                  key={String(opt.val)}
                  type="button"
                  onClick={() => update(q.key, { answer: opt.val })}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    ans === opt.val
                      ? opt.val
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400"
                        : "bg-primary/10 border-primary/40 text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary",
                  )}
                  data-testid={`q-${q.key}-${opt.val ? "yes" : "no"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {ans === true && (
              <Textarea
                placeholder="Observaciones (opcional)…"
                value={v[q.key].note}
                onChange={(e) => update(q.key, { note: e.target.value })}
                className="text-xs min-h-[52px]"
                data-testid={`q-${q.key}-note`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
