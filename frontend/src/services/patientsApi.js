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
};
