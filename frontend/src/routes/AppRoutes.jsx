import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "@/guards/ProtectedRoute";
import AdminLayout from "@/layouts/AdminLayout";
import Login from "@/features/auth/Login";
import DashboardRouter from "@/features/dashboard/DashboardRouter";
import PatientsList from "@/features/patients/PatientsList";
import PatientDetail from "@/features/patients/PatientDetail";
import MyAssignedPatients from "@/features/patients/MyAssignedPatients";
import AppointmentsList from "@/features/appointments/AppointmentsList";
import MyDentistAppointments from "@/features/appointments/MyDentistAppointments";
import AgendaCalendar from "@/features/appointments/AgendaCalendar";
import Agenda from "@/features/appointments/Agenda";
import RegisterPayment from "@/features/payments/RegisterPayment";
import LeadsList from "@/features/leads/LeadsList";
import PaymentsList from "@/features/payments/PaymentsList";
import TreatmentsList from "@/features/treatments/TreatmentsList";
import DoctorsList from "@/features/doctors/DoctorsList";
import AdminDoctorsPage from "@/features/admin/AdminDoctorsPage";
import ActivityList from "@/features/activity/ActivityList";
import FollowUpsList from "@/features/follow-ups/FollowUpsList";
import RecordsList from "@/features/records/RecordsList";
import NextAppointment from "@/features/patient/NextAppointment";
import AccountStatement from "@/features/patient/AccountStatement";
import Budget from "@/features/patient/Budget";
import TreatmentTimeline from "@/features/patient/TreatmentTimeline";
import DigitalCard from "@/features/patient/DigitalCard";
import { ROLES } from "@/constants/roles";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardRouter />} />

        {/* Admin + roles compartidos */}
        <Route
          path="/pacientes"
          element={
            <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.RECEPCIONISTA]}>
              <PatientsList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pacientes/:id"
          element={
            <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.RECEPCIONISTA, ROLES.DENTISTA]}>
              <PatientDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/citas"
          element={
            <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
              <AppointmentsList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leads"
          element={
            <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.RECEPCIONISTA]}>
              <LeadsList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pagos"
          element={
            <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.RECEPCIONISTA]}>
              <RegisterPayment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tratamientos"
          element={
            <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.DENTISTA]}>
              <TreatmentsList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctores"
          element={
            <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
              <DoctorsList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/actividad"
          element={
            <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
              <ActivityList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/doctores"
          element={
            <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
              <AdminDoctorsPage />
            </ProtectedRoute>
          }
        />

        {/* Recepcionista */}
        <Route
          path="/agenda"
          element={
            <ProtectedRoute allowedRoles={[ROLES.RECEPCIONISTA, ROLES.ADMIN]}>
              <Agenda />
            </ProtectedRoute>
          }
        />
        <Route
          path="/seguimientos"
          element={
            <ProtectedRoute allowedRoles={[ROLES.RECEPCIONISTA, ROLES.ADMIN]}>
              <FollowUpsList />
            </ProtectedRoute>
          }
        />

        {/* Dentista */}
        <Route
          path="/mis-citas"
          element={
            <ProtectedRoute allowedRoles={[ROLES.DENTISTA]}>
              <MyDentistAppointments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mis-pacientes"
          element={
            <ProtectedRoute allowedRoles={[ROLES.DENTISTA]}>
              <MyAssignedPatients />
            </ProtectedRoute>
          }
        />
        <Route
          path="/expedientes"
          element={
            <ProtectedRoute allowedRoles={[ROLES.DENTISTA, ROLES.ADMIN]}>
              <RecordsList />
            </ProtectedRoute>
          }
        />

        {/* Paciente */}
        <Route
          path="/mi-cita"
          element={
            <ProtectedRoute allowedRoles={[ROLES.PACIENTE]}>
              <NextAppointment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mi-cuenta"
          element={
            <ProtectedRoute allowedRoles={[ROLES.PACIENTE]}>
              <AccountStatement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mi-presupuesto"
          element={
            <ProtectedRoute allowedRoles={[ROLES.PACIENTE]}>
              <Budget />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mi-tratamiento"
          element={
            <ProtectedRoute allowedRoles={[ROLES.PACIENTE]}>
              <TreatmentTimeline />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mi-carnet"
          element={
            <ProtectedRoute allowedRoles={[ROLES.PACIENTE]}>
              <DigitalCard />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
