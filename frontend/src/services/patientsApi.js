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
  async getDetail(id) {
    const { data } = await httpClient.get(`${API_ENDPOINTS.patients.list}/${id}/detail`);
    return data?.data ?? null;
  },

  /** GET /patients/{id}/appointments → { data: [...] } */
  async getAppointments(id) {
    const { data } = await httpClient.get(`${API_ENDPOINTS.patients.list}/${id}/appointments`);
    return Array.isArray(data?.data) ? data.data : [];
  },

  /** GET /patients/{id}/activity-logs?page=&size= → { data: { content, page, size, totalElements, totalPages } } */
  async getActivityLogs(id, { page = 0, size = 20 } = {}) {
    const { data } = await httpClient.get(`${API_ENDPOINTS.patients.list}/${id}/activity-logs`, {
      params: { page, size },
    });
    return data?.data ?? { content: [], page: 0, size, totalElements: 0, totalPages: 0 };
  },
};
