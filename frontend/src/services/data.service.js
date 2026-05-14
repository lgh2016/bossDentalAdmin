import {
  doctors,
  patients,
  appointments,
  leads,
  payments,
  treatments,
  treatmentTimelineByPatient,
  activity,
  followUps,
} from "@/mocks";

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));

export const patientsService = {
  async list() {
    await delay();
    return [...patients];
  },
  async getById(id) {
    await delay();
    return patients.find((p) => p.id === id) || null;
  },
};

export const appointmentsService = {
  async list() {
    await delay();
    return [...appointments];
  },
  async listByDoctor(doctorId) {
    await delay();
    return appointments.filter((a) => a.doctorId === doctorId);
  },
  async listByPatient(patientId) {
    await delay();
    return appointments.filter((a) => a.patientId === patientId);
  },
  async listToday() {
    await delay();
    const today = new Date().toISOString().slice(0, 10);
    return appointments.filter((a) => a.date === today);
  },
};

export const leadsService = {
  async list() {
    await delay();
    return [...leads];
  },
};

export const paymentsService = {
  async list() {
    await delay();
    return [...payments];
  },
  async listByPatient(patientId) {
    await delay();
    return payments.filter((p) => p.patientId === patientId);
  },
};

export const treatmentsService = {
  async list() {
    await delay();
    return [...treatments];
  },
  async listByDoctor(doctorId) {
    await delay();
    return treatments.filter((t) => t.doctorId === doctorId);
  },
  async listByPatient(patientId) {
    await delay();
    return treatments.filter((t) => t.patientId === patientId);
  },
  async timeline(patientId) {
    await delay();
    return treatmentTimelineByPatient[patientId] || treatmentTimelineByPatient["p-1"];
  },
};

export const doctorsService = {
  async list() {
    await delay();
    return [...doctors];
  },
};

export const activityService = {
  async list() {
    await delay();
    return [...activity];
  },
  async followUps() {
    await delay();
    return [...followUps];
  },
};
