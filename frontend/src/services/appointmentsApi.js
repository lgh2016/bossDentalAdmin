import { httpClient } from "./httpClient";
import { API_ENDPOINTS } from "@/config/api";

export const appointmentsApi = {
  /** GET /appointments/start-slots?doctorId=&branchId=&date= */
  async startSlots({ doctorId, branchId = 1, date }) {
    const { data } = await httpClient.get(API_ENDPOINTS.appointments.startSlots, {
      params: { doctorId, branchId, date },
    });
    return data;
  },

  /** POST /appointments/lock */
  async lock(payload) {
    const { data } = await httpClient.post(API_ENDPOINTS.appointments.lock, payload);
    return data;
  },

  /** PUT /appointments/{id}/end-time */
  async updateEndTime(appointmentId, endTime) {
    const { data } = await httpClient.put(
      `${API_ENDPOINTS.appointments.base}/${appointmentId}/end-time`,
      { endTime },
    );
    return data;
  },

  /** PUT /appointments/{id}/start-time — actualiza la hora inicio sobre un lock existente */
  async updateStartTime(appointmentId, startTime) {
    const { data } = await httpClient.put(
      `${API_ENDPOINTS.appointments.base}/${appointmentId}/start-time`,
      { startTime },
    );
    return data;
  },

  /** PUT /appointments/{id}/dentist — cambia el doctor sobre un lock existente */
  async updateDentist(appointmentId, dentistId) {
    const { data } = await httpClient.put(
      `${API_ENDPOINTS.appointments.base}/${appointmentId}/dentist`,
      { dentistId },
    );
    return data;
  },

  /** PUT /appointments/{id}/date — cambia la fecha sobre un lock existente */
  async updateDate(appointmentId, appointmentDate) {
    const { data } = await httpClient.put(
      `${API_ENDPOINTS.appointments.base}/${appointmentId}/date`,
      { appointmentDate },
    );
    return data;
  },

  /** PUT /appointments/{id}/confirm */
  async confirm(appointmentId, payload) {
    const { data } = await httpClient.put(
      `${API_ENDPOINTS.appointments.base}/${appointmentId}/confirm`,
      payload,
    );
    return data;
  },
};
