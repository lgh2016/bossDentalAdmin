import { httpClient } from "./httpClient";

/**
 * API client para el rol DENTIST.
 * Todos los endpoints requieren accessToken con role.name === "DENTIST".
 */
export const dentistApi = {
  async me({ signal } = {}) {
    const { data } = await httpClient.get("/dentist/me", { signal });
    return data;
  },

  async stats({ date, signal } = {}) {
    const params = {};
    if (date) params.date = date;
    const { data } = await httpClient.get("/dentist/stats", { params, signal });
    return data;
  },

  async today({ date, signal } = {}) {
    const params = {};
    if (date) params.date = date;
    const { data } = await httpClient.get("/dentist/today", { params, signal });
    return Array.isArray(data) ? data : [];
  },

  async waitingRoom({ date, signal } = {}) {
    const params = {};
    if (date) params.date = date;
    const { data } = await httpClient.get("/dentist/waiting-room", { params, signal });
    return Array.isArray(data) ? data : [];
  },

  async inProgress({ signal } = {}) {
    const { data } = await httpClient.get("/dentist/in-progress", { signal });
    return Array.isArray(data) ? data : [];
  },

  async completedToday({ date, signal } = {}) {
    const params = {};
    if (date) params.date = date;
    const { data } = await httpClient.get("/dentist/completed-today", { params, signal });
    return Array.isArray(data) ? data : [];
  },

  async agenda({ date, from, to, signal } = {}) {
    const params = {};
    if (date) params.date = date;
    if (from) params.from = from;
    if (to) params.to = to;
    const { data } = await httpClient.get("/dentist/agenda", { params, signal });
    return Array.isArray(data) ? data : [];
  },

  async patients({ page = 0, size = 20, query = "", signal } = {}) {
    const { data } = await httpClient.get("/dentist/patients", { params: { page, size, query }, signal });
    return data;
  },

  async activity({ page = 0, size = 20, signal } = {}) {
    const { data } = await httpClient.get("/dentist/activity", { params: { page, size }, signal });
    return data?.data ?? { content: [], page: 0, size, totalElements: 0, totalPages: 0 };
  },
};
