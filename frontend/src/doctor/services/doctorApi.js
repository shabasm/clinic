import api, { collection } from "../../admin/services/api";

export async function getDoctorProfile() {
  const { data } = await api.get("doctor/profile/");
  return data;
}

export async function getDoctorQueue(date) {
  const params = date ? { date } : {};
  const { data } = await api.get("doctor/queue/", { params });
  return collection(data);
}

export async function startConsultation(tokenId) {
  const { data } = await api.post(`doctor/tokens/${tokenId}/start/`);
  return data;
}

export async function getConsultation(id) {
  const { data } = await api.get(`doctor/consultations/${id}/`);
  return data;
}

export async function saveDraftConsultation(id, payload) {
  const { data } = await api.post(`doctor/consultations/${id}/draft/`, payload);
  return data;
}

export async function completeConsultation(id, payload) {
  const { data } = await api.post(`doctor/consultations/${id}/complete/`, payload);
  return data;
}

export async function getMedicines(search) {
  const params = search ? { search } : {};
  const { data } = await api.get("doctor/medicines/", { params });
  return collection(data);
}

export async function getLabTests(search) {
  const params = search ? { search } : {};
  const { data } = await api.get("doctor/lab-tests/", { params });
  return collection(data);
}

export async function getPastConsultations(params = {}) {
  const { data } = await api.get("doctor/past-consultations/", { params });
  return collection(data);
}

export async function searchPatients(search) {
  const params = search ? { search } : {};
  const { data } = await api.get("doctor/patients/", { params });
  return collection(data);
}

export async function getPatientHistory(patientId) {
  const { data } = await api.get(`doctor/patients/${patientId}/history/`);
  return data;
}
