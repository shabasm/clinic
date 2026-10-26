
import axios from 'axios'

const api = axios.create({
  baseURL: 'http://127.0.0.1:8000/api/reception/',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Patients
export const getPatients = () => api.get('patients/')

export const createPatient = (patient) =>
  api.post('patients/', patient)

export const updatePatient = (id, patient) =>
  api.patch(`patients/${id}/`, patient)

export const deactivatePatient = (id) =>
  api.delete(`patients/${id}/`)

// Doctors
export const getDoctors = () => api.get('doctors/')

// Appointments
export const getBookings = () => api.get('bookings/')

export const createBooking = (booking) =>
  api.post('bookings/', booking)

// Registration billing
export const getRegistrationBills = () =>
  api.get('registration-bills/')

export const createRegistrationBill = (patientId) =>
  api.post('registration-bills/', { patient: patientId })

export const payRegistrationBill = (billId) =>
  api.post(`registration-bills/${billId}/pay/`)

// Token queue
export const getTokens = () => api.get('tokens/')

// Consultations
export const getConsultations = () =>
  api.get('consultations/')

export const createConsultation = (tokenId) =>
  api.post('consultations/', { token: tokenId })

export const completeConsultation = (consultationId) =>
  api.post(`consultations/${consultationId}/complete/`)

// Consultation billing: payment endpoint only.
// Your current urls.py does not include a GET list endpoint.
export const payConsultationBill = (billId) =>
  api.post(`consultation-bills/${billId}/pay/`)

export default api
