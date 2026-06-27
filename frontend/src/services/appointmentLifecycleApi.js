import { httpClient } from "./httpClient";
import { API_ENDPOINTS } from "@/config/api";

/**
 * Acciones de ciclo de vida de una cita (P1).
 * Complemento de appointmentsApi para los flujos de recepción/dentista.
 */
const base = API_ENDPOINTS.appointments.base;

export const appointmentLifecycleApi = {
  async cancel(appointmentId, reason = "") {
    const { data } = await httpClient.put(`${base}/${appointmentId}/cancel`, { reason });
    return data;
  },
  async reschedule(appointmentId, payload) {
    // payload: { appointmentDate?, startTime?, endTime?, doctorId? }
    const { data } = await httpClient.put(`${base}/${appointmentId}/reschedule`, payload);
    return data;
  },
  async arrive(appointmentId) {
    const { data } = await httpClient.put(`${base}/${appointmentId}/arrive`);
    return data;
  },
  async assignDoctor(appointmentId, doctorId, { confirmReplace = false } = {}) {
    const { data } = await httpClient.put(`${base}/${appointmentId}/assign-doctor`, { doctorId, confirmReplace });
    return data;
  },
  async startAttention(appointmentId) {
    const { data } = await httpClient.put(`${base}/${appointmentId}/start-attention`);
    return data;
  },
  async finishAttention(appointmentId, notes = "") {
    const { data } = await httpClient.put(`${base}/${appointmentId}/finish-attention`, { notes });
    return data;
  },
  async noShow(appointmentId) {
    const { data } = await httpClient.put(`${base}/${appointmentId}/no-show`);
    return data;
  },
};
