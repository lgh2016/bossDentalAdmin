import { httpClient } from "./httpClient";

const base = "/admin/doctors";

export const adminDoctorsApi = {
  async list({ includeInactive = true, signal } = {}) {
    const { data } = await httpClient.get(base, { params: { includeInactive }, signal });
    return Array.isArray(data) ? data : [];
  },
  async get(id, { signal } = {}) {
    const { data } = await httpClient.get(`${base}/${id}`, { signal });
    return data;
  },
  async create(payload) {
    const { data } = await httpClient.post(base, payload);
    return data;
  },
  async update(id, payload) {
    const { data } = await httpClient.put(`${base}/${id}`, payload);
    return data;
  },
  async changePassword(id, newPassword) {
    const { data } = await httpClient.put(`${base}/${id}/password`, { newPassword });
    return data;
  },
};
