import PageHeader from "@/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Download, Check } from "lucide-react";
import { treatments } from "@/mocks";
import { currencyMXN } from "@/utils/format";

const items = [
  { concept: "Consulta inicial y diagnóstico", qty: 1, price: 600 },
  { concept: "Limpieza profesional", qty: 1, price: 850 },
  { concept: "Brackets metálicos (colocación)", qty: 1, price: 12000 },
  { concept: "Mensualidades de ajuste (12)", qty: 12, price: 800 },
  { concept: "Retenedores (par)", qty: 1, price: 2500 },
];

export default function Budget({ patientId = "p-1" }) {
  const t = treatments.find((x) => x.patientId === patientId);
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const discount = 1200;
  const total = subtotal - discount;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mi presupuesto"
        subtitle={t ? `Plan estimado para tu tratamiento de ${t.name.toLowerCase()}.` : "Plan estimado de tu tratamiento."}
        actions={<Button variant="outline"><Download size={14} className="mr-1.5" /> Descargar PDF</Button>}
      />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Presupuesto</p>
            <p className="text-base font-semibold mt-0.5">Boss Dental · Plan personalizado</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground">Vigencia</p>
            <p className="text-sm font-medium">31 / Mar / 2026</p>
          </div>
        </div>

        <div className="divide-y divide-border">
          {items.map((i, idx) => (
            <div key={idx} className="flex items-center gap-4 px-5 py-3 text-sm">
              <Check size={14} className="text-primary" />
              <div className="flex-1">{i.concept}</div>
              <div className="w-12 text-center text-muted-foreground">×{i.qty}</div>
              <div className="w-32 text-right font-medium">{currencyMXN(i.price * i.qty)}</div>
            </div>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-border space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{currencyMXN(subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Descuento promocional</span><span className="text-emerald-600 dark:text-emerald-400">- {currencyMXN(discount)}</span></div>
          <div className="flex justify-between font-semibold pt-1.5 border-t border-border mt-1.5"><span>Total estimado</span><span className="text-lg">{currencyMXN(total)}</span></div>
        </div>
      </div>
    </div>
  );
}
