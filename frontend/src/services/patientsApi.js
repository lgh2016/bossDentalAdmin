import { httpClient } from "./httpClient";
import { API_ENDPOINTS } from "@/config/api";

/**
 * Wrapper centralizado para los endpoints de pacientes (API VPS).
 * El token JWT lo inyecta `httpClient` automáticamente.
 */
export const patientsApi = {
  /** POST /patients */
  async create(payload) {
    const { data } = await httpClient.post(API_ENDPOINTS.patients.list, payload);
    return data;
  },

  /**
   * GET /patients?page=&size=&query=
   * Devuelve la respuesta paginada de Spring: { content: [...], ... }
   */
  async search({ query = "", page = 0, size = 10 } = {}) {
    const { data } = await httpClient.get(API_ENDPOINTS.patients.list, {
      params: { page, size, query },
    });
    return data;
  },

  /** GET /patients/{id}/detail → { data, success, message } */
  async getDetail(id, { signal } = {}) {
    const { data } = await httpClient.get(`${API_ENDPOINTS.patients.list}/${id}/detail`, { signal });
    return data?.data ?? null;
  },

  /** GET /patients/{id} → registro completo para precargar el formulario de edición */
  async get(id, { signal } = {}) {
    const { data } = await httpClient.get(`${API_ENDPOINTS.patients.list}/${id}`, { signal });
    return data;
  },

  /** PATCH /patients/{id} → actualización parcial */
  async update(id, payload) {
    const { data } = await httpClient.patch(`${API_ENDPOINTS.patients.list}/${id}`, payload);
    return data;
  },

  /** GET /patients/{id}/notes → listado de notas (más reciente primero) */
  async listNotes(id, { signal } = {}) {
    const { data } = await httpClient.get(`${API_ENDPOINTS.patients.list}/${id}/notes`, { signal });
    return Array.isArray(data?.data) ? data.data : [];
  },

  /** POST /patients/{id}/notes → crea una nota */
  async createNote(id, content) {
    const { data } = await httpClient.post(`${API_ENDPOINTS.patients.list}/${id}/notes`, { content });
    return data?.data;
  },

  /** GET /patients/{id}/payments → { data, totals, total } */
  async listPayments(id, { signal } = {}) {
    const { data } = await httpClient.get(`${API_ENDPOINTS.patients.list}/${id}/payments`, { signal });
    return {
      items: Array.isArray(data?.data) ? data.data : [],
      totals: data?.totals || { paidAmount: 0, totalBudgeted: 0, balance: 0 },
    };
  },

  /** POST /patients/{id}/payments → registra un pago */
  async createPayment(id, payload) {
    const { data } = await httpClient.post(`${API_ENDPOINTS.patients.list}/${id}/payments`, payload);
    return data;
  },

  /** GET /patients/{id}/budget → presupuesto guardado o null (compat, deprecated) */
  async getBudget(id, { signal } = {}) {
    const { data } = await httpClient.get(`${API_ENDPOINTS.patients.list}/${id}/budget`, { signal });
    return { budget: data?.data || null, totals: data?.totals || null };
  },

  /** POST /patients/{id}/budget → crea nuevo (compat, deprecated) */
  async saveBudget(id, payload) {
    const { data } = await httpClient.post(`${API_ENDPOINTS.patients.list}/${id}/budget`, payload);
    return data;
  },

  /** GET /patients/{id}/budgets → todos los presupuestos del paciente */
  async listBudgets(id, { signal } = {}) {
    const { data } = await httpClient.get(`${API_ENDPOINTS.patients.list}/${id}/budgets`, { signal });
    return {
      items: Array.isArray(data?.data) ? data.data : [],
      totals: data?.totals || { paidAmount: 0, totalBudgeted: 0, balance: 0 },
    };
  },

  /** POST /patients/{id}/budgets → crea un nuevo presupuesto ACTIVE */
  async createBudget(id, payload) {
    const { data } = await httpClient.post(`${API_ENDPOINTS.patients.list}/${id}/budgets`, payload);
    return data;
  },

  /** PATCH /patients/{id}/budgets/{budgetId} → actualiza (sólo DRAFT/ACTIVE) */
  async updateBudget(id, budgetId, payload) {
    const { data } = await httpClient.patch(`${API_ENDPOINTS.patients.list}/${id}/budgets/${budgetId}`, payload);
    return data;
  },

  /** PUT /patients/{id}/budgets/{budgetId}/finalize */
  async finalizeBudget(id, budgetId) {
    const { data } = await httpClient.put(`${API_ENDPOINTS.patients.list}/${id}/budgets/${budgetId}/finalize`);
    return data;
  },

  /** PUT /patients/{id}/budgets/{budgetId}/cancel */
  async cancelBudget(id, budgetId) {
    const { data } = await httpClient.put(`${API_ENDPOINTS.patients.list}/${id}/budgets/${budgetId}/cancel`);
    return data;
  },

  /** PUT /patients/{id}/budgets/{budgetId}/present (DRAFT → PRESENTED) */
  async presentBudget(id, budgetId) {
    const { data } = await httpClient.put(`${API_ENDPOINTS.patients.list}/${id}/budgets/${budgetId}/present`);
    return data;
  },

  /** PUT /patients/{id}/budgets/{budgetId}/accept (PRESENTED → ACCEPTED) */
  async acceptBudget(id, budgetId) {
    const { data } = await httpClient.put(`${API_ENDPOINTS.patients.list}/${id}/budgets/${budgetId}/accept`);
    return data;
  },

  /** PUT /patients/{id}/budgets/{budgetId}/reject (PRESENTED → REJECTED) */
  async rejectBudget(id, budgetId) {
    const { data } = await httpClient.put(`${API_ENDPOINTS.patients.list}/${id}/budgets/${budgetId}/reject`);
    return data;
  },

  // ====== Tratamientos ======

  /** GET /patients/{id}/treatments */
  async listTreatments(id, { signal } = {}) {
    const { data } = await httpClient.get(`${API_ENDPOINTS.patients.list}/${id}/treatments`, { signal });
    return Array.isArray(data?.data) ? data.data : [];
  },

  /** POST /patients/{id}/treatments — crea desde presupuesto ACEPTADO */
  async createTreatment(id, { budgetId, dentistId } = {}) {
    const { data } = await httpClient.post(`${API_ENDPOINTS.patients.list}/${id}/treatments`, { budgetId, dentistId });
    return data;
  },

  /** PATCH /patients/{id}/treatments/{treatmentId}/activities/{activityId} */
  async updateActivity(id, treatmentId, activityId, payload) {
    const { data } = await httpClient.patch(
      `${API_ENDPOINTS.patients.list}/${id}/treatments/${treatmentId}/activities/${activityId}`,
      payload,
    );
    return data;
  },

  /** PUT /patients/{id}/treatments/{treatmentId}/finalize */
  async finalizeTreatment(id, treatmentId) {
    const { data } = await httpClient.put(`${API_ENDPOINTS.patients.list}/${id}/treatments/${treatmentId}/finalize`);
    return data;
  },

  /** PUT /patients/{id}/treatments/{treatmentId}/cancel */
  async cancelTreatment(id, treatmentId) {
    const { data } = await httpClient.put(`${API_ENDPOINTS.patients.list}/${id}/treatments/${treatmentId}/cancel`);
    return data;
  },

  /** PUT /patients/{id}/treatments/{treatmentId}/pause */
  async pauseTreatment(id, treatmentId) {
    const { data } = await httpClient.put(`${API_ENDPOINTS.patients.list}/${id}/treatments/${treatmentId}/pause`);
    return data;
  },

  /** PUT /patients/{id}/treatments/{treatmentId}/resume */
  async resumeTreatment(id, treatmentId) {
    const { data } = await httpClient.put(`${API_ENDPOINTS.patients.list}/${id}/treatments/${treatmentId}/resume`);
    return data;
  },

  /** GET /patients/{id}/appointments → { data: [...] } */
  async getAppointments(id, { signal } = {}) {
    const { data } = await httpClient.get(`${API_ENDPOINTS.patients.list}/${id}/appointments`, { signal });
    return Array.isArray(data?.data) ? data.data : [];
  },

  /** GET /patients/{id}/activity-logs?page=&size= */
  async getActivityLogs(id, { page = 0, size = 20, signal } = {}) {
    const { data } = await httpClient.get(`${API_ENDPOINTS.patients.list}/${id}/activity-logs`, {
      params: { page, size }, signal,
    });
    return data?.data ?? { content: [], page: 0, size, totalElements: 0, totalPages: 0 };
  },
};
