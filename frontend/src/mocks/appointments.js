const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const t = (h, m = 0) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
const future = (offsetDays) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  return iso(d);
};

export const appointments = [
  { id: "a-1", patientId: "p-1", patientName: "Carlos Mendoza", doctorId: "d-1", doctorName: "Dra. Sofía Reyes", date: iso(today), time: t(9, 30), duration: 45, type: "Limpieza", status: "Confirmada", notes: "Seguimiento ortodoncia" },
  { id: "a-2", patientId: "p-2", patientName: "Lucía Domínguez", doctorId: "d-3", doctorName: "Dra. Ana Villarreal", date: iso(today), time: t(10, 30), duration: 60, type: "Blanqueamiento", status: "Confirmada", notes: "" },
  { id: "a-3", patientId: "p-3", patientName: "Roberto Salinas", doctorId: "d-2", doctorName: "Dr. Ricardo Mora", date: iso(today), time: t(12, 0), duration: 45, type: "Endodoncia", status: "En curso", notes: "Pieza 24" },
  { id: "a-4", patientId: "p-4", patientName: "Mariana Ortiz", doctorId: "d-4", doctorName: "Dr. Javier Núñez", date: iso(today), time: t(13, 30), duration: 90, type: "Implante", status: "Pendiente", notes: "Etapa 1" },
  { id: "a-5", patientId: "p-6", patientName: "Andrea Cervantes", doctorId: "d-3", doctorName: "Dra. Ana Villarreal", date: iso(today), time: t(16, 0), duration: 30, type: "Consulta", status: "Confirmada", notes: "" },
  { id: "a-6", patientId: "p-7", patientName: "Pablo Restrepo", doctorId: "d-5", doctorName: "Dra. Lorena Pacheco", date: iso(today), time: t(17, 0), duration: 30, type: "Revisión infantil", status: "Confirmada", notes: "" },
  { id: "a-7", patientId: "p-8", patientName: "Valeria Quintero", doctorId: "d-1", doctorName: "Dra. Sofía Reyes", date: future(1), time: t(10, 0), duration: 45, type: "Brackets", status: "Confirmada", notes: "" },
  { id: "a-8", patientId: "p-1", patientName: "Carlos Mendoza", doctorId: "d-1", doctorName: "Dra. Sofía Reyes", date: future(7), time: t(11, 0), duration: 45, type: "Ajuste", status: "Confirmada", notes: "" },
  { id: "a-9", patientId: "p-2", patientName: "Lucía Domínguez", doctorId: "d-3", doctorName: "Dra. Ana Villarreal", date: future(2), time: t(14, 0), duration: 60, type: "Carillas", status: "Pendiente", notes: "" },
  { id: "a-10", patientId: "p-3", patientName: "Roberto Salinas", doctorId: "d-2", doctorName: "Dr. Ricardo Mora", date: future(3), time: t(9, 0), duration: 45, type: "Control", status: "Confirmada", notes: "" },
  { id: "a-11", patientId: "p-5", patientName: "Diego Aguirre", doctorId: "d-1", doctorName: "Dra. Sofía Reyes", date: future(-1), time: t(12, 0), duration: 30, type: "Limpieza", status: "Completada", notes: "" },
  { id: "a-12", patientId: "p-4", patientName: "Mariana Ortiz", doctorId: "d-4", doctorName: "Dr. Javier Núñez", date: future(-2), time: t(13, 0), duration: 60, type: "Implante", status: "Cancelada", notes: "" },
];
