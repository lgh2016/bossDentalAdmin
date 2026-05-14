export const auditLogs = [
  { id: "au-1", patientId: "p-1", type: "appointment_created", actor: "María Hernández", role: "RECEPCIONISTA", at: "2026-02-12 09:15", description: "Cita creada", meta: { type: "Limpieza", date: "2026-02-12" } },
  { id: "au-2", patientId: "p-1", type: "payment_registered", actor: "María Hernández", role: "RECEPCIONISTA", at: "2026-02-12 10:25", description: "Pago de mensualidad 4/12", meta: { amount: 1800, method: "Tarjeta" } },
  { id: "au-3", patientId: "p-4", type: "doctor_changed", actor: "María Hernández", role: "RECEPCIONISTA", at: "2026-02-14 11:42", description: "Cambio de doctor por agenda saturada", meta: { from: "Dr. Javier Núñez", to: "Dr. Ricardo Mora", reason: "Agenda saturada" } },
];
