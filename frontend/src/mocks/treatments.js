export const treatments = [
  { id: "t-1", patientId: "p-1", patientName: "Carlos Mendoza", doctorId: "d-1", name: "Ortodoncia con brackets", progress: 35, sessions: { done: 4, total: 12 }, startDate: "2025-11-01", status: "En curso", totalCost: 21600 },
  { id: "t-2", patientId: "p-4", patientName: "Mariana Ortiz", doctorId: "d-4", name: "Implante dental", progress: 20, sessions: { done: 1, total: 5 }, startDate: "2026-02-01", status: "En curso", totalCost: 39000 },
  { id: "t-3", patientId: "p-2", patientName: "Lucía Domínguez", doctorId: "d-3", name: "Blanqueamiento", progress: 100, sessions: { done: 3, total: 3 }, startDate: "2026-01-15", status: "Completado", totalCost: 4500 },
  { id: "t-4", patientId: "p-3", patientName: "Roberto Salinas", doctorId: "d-2", name: "Endodoncia 24", progress: 80, sessions: { done: 2, total: 3 }, startDate: "2026-01-20", status: "En curso", totalCost: 3200 },
  { id: "t-5", patientId: "p-8", patientName: "Valeria Quintero", doctorId: "d-1", name: "Diseño de sonrisa", progress: 50, sessions: { done: 3, total: 6 }, startDate: "2025-12-10", status: "En curso", totalCost: 25000 },
  { id: "t-6", patientId: "p-6", patientName: "Andrea Cervantes", doctorId: "d-3", name: "Carillas estéticas", progress: 25, sessions: { done: 1, total: 4 }, startDate: "2026-02-01", status: "En curso", totalCost: 18000 },
];

export const treatmentTimelineByPatient = {
  "p-1": [
    { date: "2025-11-01", title: "Inicio del tratamiento", description: "Colocación de brackets superiores e inferiores.", status: "Completado" },
    { date: "2025-12-05", title: "Primer ajuste", description: "Cambio de ligas y revisión de progreso.", status: "Completado" },
    { date: "2026-01-10", title: "Segundo ajuste", description: "Activación de arco superior.", status: "Completado" },
    { date: "2026-02-12", title: "Tercer ajuste", description: "Revisión y ajuste fino.", status: "Completado" },
    { date: "2026-03-12", title: "Cuarto ajuste", description: "Próxima cita programada.", status: "Pendiente" },
  ],
};
