
import axios from 'axios'

const apiRoot = 'http://127.0.0.1:8000/api/'

const api = axios.create({
  baseURL: `${apiRoot}reception/`,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const refresh = localStorage.getItem('refresh')

    if (error.response?.status !== 401 || !originalRequest) {
      return Promise.reject(error)
    }

    if (refresh && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const { data } = await axios.post(`${apiRoot}token/refresh/`, { refresh })
        localStorage.setItem('access', data.access)
        originalRequest.headers.Authorization = `Bearer ${data.access}`
        return api(originalRequest)
      } catch (refreshError) {
        localStorage.removeItem('access')
        localStorage.removeItem('refresh')
        localStorage.removeItem('role')
        window.location.assign('/login')
        return Promise.reject(refreshError)
      }
    }

    localStorage.removeItem('access')
    localStorage.removeItem('refresh')
    localStorage.removeItem('role')
    window.location.assign('/login')
    return Promise.reject(error)
  },
)

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
