
import api from "./api";

export const getDoctors = () => api.get("doctors/");
export const addDoctor = (data) => api.post("doctors/", data);
export const updateDoctor = (id, data) =>
  api.patch(`doctors/${id}/`, data);
