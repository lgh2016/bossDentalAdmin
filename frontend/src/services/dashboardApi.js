import { httpClient } from "./httpClient";
import { API_ENDPOINTS } from "@/config/api";

export const dashboardApi = {
  /** GET /api/dashboard/appointments/today/count → { total } */
  async todayCount({ signal } = {}) {
    const { data } = await httpClient.get(API_ENDPOINTS.dashboard.todayCount, { signal });
    return data;
  },

  /** GET /api/dashboard/appointments/today?page=&size= → paginado */
  async todayPaged({ page = 0, size = 10, signal } = {}) {
    const { data } = await httpClient.get(API_ENDPOINTS.dashboard.todayPaged, {
      params: { page, size }, signal,
    });
    return data;
  },
};
