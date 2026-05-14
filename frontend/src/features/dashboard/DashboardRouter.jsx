import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { ROLES } from "@/constants/roles";
import AdminDashboard from "./AdminDashboard";
import ReceptionistDashboard from "./ReceptionistDashboard";
import DentistDashboard from "./DentistDashboard";
import PatientDashboard from "./PatientDashboard";

export default function DashboardRouter() {
  const { user } = useAuth();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  if (user.role === ROLES.ADMIN) return <AdminDashboard now={now} />;
  if (user.role === ROLES.RECEPCIONISTA) return <ReceptionistDashboard now={now} />;
  if (user.role === ROLES.DENTISTA) return <DentistDashboard now={now} />;
  return <PatientDashboard now={now} />;
}
