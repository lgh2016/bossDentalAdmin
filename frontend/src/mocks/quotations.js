// Cotizaciones iniciales (1 por paciente). Si quieres más pacientes con cotización, añade aquí.
export const quotations = [
  {
    id: "q-1",
    patientId: "p-1",
    name: "Plan ortodoncia integral",
    items: [
      { id: "qi-1", procedureId: "pr-1", name: "Consulta inicial", tooth: "", description: "Valoración y diagnóstico", qty: 1, unitPrice: 50, subtotal: 50 },
      { id: "qi-2", procedureId: "pr-2", name: "Limpieza dental", tooth: "", description: "Profilaxis previa", qty: 1, unitPrice: 850, subtotal: 850 },
      { id: "qi-3", procedureId: "pr-9", name: "Brackets metálicos (colocación)", tooth: "", description: "Aparatología fija superior e inferior", qty: 1, unitPrice: 12000, subtotal: 12000 },
      { id: "qi-4", procedureId: null, name: "Mensualidades de ajuste", tooth: "", description: "12 ajustes mensuales", qty: 12, unitPrice: 800, subtotal: 9600 },
    ],
    observations: "Tratamiento estimado a 12 meses.",
    total: 22500,
  },
  {
    id: "q-2",
    patientId: "p-4",
    name: "Implante dental pieza 36",
    items: [
      { id: "qi-5", procedureId: "pr-1", name: "Consulta inicial", tooth: "", description: "", qty: 1, unitPrice: 50, subtotal: 50 },
      { id: "qi-6", procedureId: "pr-10", name: "Implante dental", tooth: "36", description: "Colocación de implante", qty: 1, unitPrice: 18000, subtotal: 18000 },
      { id: "qi-7", procedureId: "pr-4", name: "Corona zirconia", tooth: "36", description: "Corona definitiva", qty: 1, unitPrice: 6800, subtotal: 6800 },
    ],
    observations: "Tratamiento en 3 fases.",
    total: 24850,
  },
];
