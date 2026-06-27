import { httpClient } from "./httpClient";
import { API_ENDPOINTS } from "@/config/api";

export const doctorsApi = {
  /** GET /doctors/active?branchId=1 */
  async listActive({ branchId = 1, signal } = {}) {
    const { data } = await httpClient.get(API_ENDPOINTS.doctors.active, {
      params: { branchId },
      signal,
    });
    return data;
  },
};
