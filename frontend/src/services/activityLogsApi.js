import { httpClient } from "./httpClient";

/**
 * Actividad reciente general del sistema (no filtrada por paciente).
 * GET /activity-logs?page=&size=
 * Devuelve { content, page, size, totalElements, totalPages }
 */
export const activityLogsApi = {
  async list({ page = 0, size = 20, signal } = {}) {
    const { data } = await httpClient.get("/activity-logs", { params: { page, size }, signal });
    return data?.data ?? { content: [], page: 0, size, totalElements: 0, totalPages: 0 };
  },
};
