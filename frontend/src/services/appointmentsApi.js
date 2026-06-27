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

  /**
   * GET /appointments/{id}/end-slots?startTime=HH:mm
   * Devuelve { appointmentId, startTime, endSlots[] }
   * Sólo se usa cuando ya existe un appointmentId (cita en edición).
   */
  async endSlots(appointmentId, startTime) {
    const { data } = await httpClient.get(
      `${API_ENDPOINTS.appointments.base}/${appointmentId}/end-slots`,
      { params: { startTime } },
    );
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

  /** POST /appointments/cleanup-expired-locks — limpia locks zombis al abrir el modal */
  async cleanupExpiredLocks() {
    const { data } = await httpClient.post(API_ENDPOINTS.appointments.cleanupExpiredLocks);
    return data;
  },

  /** GET /appointments/schedule/month?year=&month=&branchId=&dentistId= */
  async scheduleMonth({ year, month, branchId = 1, dentistId }) {
    const params = { year, month, branchId };
    if (dentistId != null) params.dentistId = dentistId;
    const { data } = await httpClient.get(API_ENDPOINTS.appointments.scheduleMonth, { params });
    return data;
  },

  /** GET /appointments/schedule/day?date=&branchId=&dentistId= */
  async scheduleDay({ date, branchId = 1, dentistId, signal } = {}) {
    const params = { date, branchId };
    if (dentistId != null) params.dentistId = dentistId;
    const { data } = await httpClient.get(API_ENDPOINTS.appointments.scheduleDay, { params, signal });
    return data;
  },

  /** GET /appointments/{id} — detalle de la cita */
  async getById(appointmentId, { signal } = {}) {
    const { data } = await httpClient.get(`${API_ENDPOINTS.appointments.base}/${appointmentId}`, { signal });
    return data;
  },

  /** GET /appointments/{id}/history — bitácora de la cita */
  async history(appointmentId, { signal } = {}) {
    const { data } = await httpClient.get(`${API_ENDPOINTS.appointments.base}/${appointmentId}/history`, { signal });
    return data;
  },

  /** POST /appointments/walk-in — paciente sin cita previa */
  async walkIn({ patientId, branchId = 1, doctorId = null, reason = "" }) {
    const payload = { patientId, branchId, reason };
    if (doctorId != null) payload.doctorId = doctorId;
    const { data } = await httpClient.post(`${API_ENDPOINTS.appointments.base}/walk-in`, payload);
    return data;
  },

  /** POST /appointments/create — cita programada directa, doctor opcional */
  async create({ patientId, branchId = 1, appointmentDate, startTime, endTime, doctorId = null, reason, notes = "" }) {
    const payload = { patientId, branchId, appointmentDate, startTime, endTime, reason, notes };
    if (doctorId != null) payload.doctorId = doctorId;
    const { data } = await httpClient.post(`${API_ENDPOINTS.appointments.base}/create`, payload);
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
