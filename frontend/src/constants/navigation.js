import {
  LayoutDashboard,
  Users,
  CalendarDays,
  UserPlus,
  CreditCard,
  Stethoscope,
  UserCog,
  Activity,
  ClipboardList,
  PhoneCall,
  FileText,
  Receipt,
  GitCommitVertical,
  IdCard,
} from "lucide-react";
import { ROLES } from "./roles";

export const NAV_BY_ROLE = {
  [ROLES.ADMIN]: [
    {
      label: "General",
      items: [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/actividad", label: "Actividad reciente", icon: Activity },
      ],
    },
    {
      label: "Operación",
      items: [
        { to: "/pacientes", label: "Pacientes", icon: Users },
        { to: "/citas", label: "Citas", icon: CalendarDays },
        { to: "/leads", label: "Leads", icon: UserPlus },
        { to: "/tratamientos", label: "Tratamientos", icon: Stethoscope },
      ],
    },
    {
      label: "Administración",
      items: [
        { to: "/pagos", label: "Pagos", icon: CreditCard },
        { to: "/doctores", label: "Doctores", icon: UserCog },
      ],
    },
  ],
  [ROLES.RECEPCIONISTA]: [
    {
      label: "Hoy",
      items: [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/agenda", label: "Agenda", icon: CalendarDays },
        { to: "/seguimientos", label: "Seguimientos", icon: PhoneCall },
      ],
    },
    {
      label: "Operación",
      items: [
        { to: "/pacientes", label: "Pacientes", icon: Users },
        { to: "/pagos", label: "Registrar pago", icon: CreditCard },
      ],
    },
  ],
  [ROLES.DENTISTA]: [
    {
      label: "Mi día",
      items: [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/mis-citas", label: "Mis citas", icon: CalendarDays },
      ],
    },
    {
      label: "Clínica",
      items: [
        { to: "/expedientes", label: "Expedientes", icon: ClipboardList },
        { to: "/mis-pacientes", label: "Pacientes asignados", icon: Users },
        { to: "/tratamientos", label: "Tratamientos", icon: Stethoscope },
      ],
    },
  ],
  [ROLES.PACIENTE]: [
    {
      label: "Mi clínica",
      items: [
        { to: "/dashboard", label: "Inicio", icon: LayoutDashboard },
        { to: "/mi-cita", label: "Próxima cita", icon: CalendarDays },
        { to: "/mi-tratamiento", label: "Tratamiento", icon: GitCommitVertical },
      ],
    },
    {
      label: "Documentos",
      items: [
        { to: "/mi-presupuesto", label: "Presupuesto", icon: FileText },
        { to: "/mi-cuenta", label: "Estado de cuenta", icon: Receipt },
        { to: "/mi-carnet", label: "Carnet digital", icon: IdCard },
      ],
    },
  ],
};
