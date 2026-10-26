
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getPatients,
  createPatient,
  updatePatient,
  deactivatePatient,
  getDoctors,
  getBookings,
  createBooking,
  getRegistrationBills,
  createRegistrationBill,
  payRegistrationBill,
  getTokens,
} from './services/api'
import './App.css'

const pages = ['Patients', 'Appointments', 'Doctors', 'Billing', 'Token queue']

const emptyPatient = {
  full_name: '',
  date_of_birth: '',
  gender: 'Male',
  phone: '',
  email: '',
  address: '',
  blood_group: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
}

const emptyBooking = {
  patient: '',
  doctor: '',
  date: '',
}

function getArray(response) {
  const data = response?.data
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.results)) return data.results
  return []
}

function readableError(error) {
  const data = error?.response?.data

  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    return Object.entries(data)
      .map(([key, value]) => {
        const message = Array.isArray(value)
          ? value.join(', ')
          : typeof value === 'object'
            ? JSON.stringify(value)
            : String(value)
        return `${key}: ${message}`
      })
      .join(' | ')
  }

  return error?.message || 'Request failed. Check the Django server and API URL.'
}

function display(value) {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function App() {
  const [activePage, setActivePage] = useState('Patients')

  const [patients, setPatients] = useState([])
  const [doctors, setDoctors] = useState([])
  const [bookings, setBookings] = useState([])
  const [bills, setBills] = useState([])
  const [tokens, setTokens] = useState([])

  const [patientForm, setPatientForm] = useState(emptyPatient)
  const [bookingForm, setBookingForm] = useState(emptyBooking)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const notifyError = (err) => setError(readableError(err))

  const loadPatients = useCallback(async () => {
    const response = await getPatients()
    setPatients(getArray(response))
  }, [])

  const loadDoctors = useCallback(async () => {
    const response = await getDoctors()
    setDoctors(getArray(response))
  }, [])

  const loadBookings = useCallback(async () => {
    const response = await getBookings()
    setBookings(getArray(response))
  }, [])

  const loadBills = useCallback(async () => {
    const response = await getRegistrationBills()
    setBills(getArray(response))
  }, [])

  const loadTokens = useCallback(async () => {
    const response = await getTokens()
    setTokens(getArray(response))
  }, [])

  const loadPageData = useCallback(async (page) => {
    setLoading(true)
    setError('')

    try {
      if (page === 'Patients') await loadPatients()
      if (page === 'Doctors') await loadDoctors()
      if (page === 'Appointments') {
        await Promise.all([loadBookings(), loadPatients(), loadDoctors()])
      }
      if (page === 'Billing') {
        await Promise.all([loadBills(), loadPatients()])
      }
      if (page === 'Token queue') await loadTokens()
    } catch (err) {
      notifyError(err)
    } finally {
      setLoading(false)
    }
  }, [loadPatients, loadDoctors, loadBookings, loadBills, loadTokens])

  useEffect(() => {
    loadPageData(activePage)
  }, [activePage, loadPageData])

  const filteredPatients = useMemo(() => {
    const query = search.trim().toLowerCase()

    return patients.filter((patient) =>
      [
        patient.id,
        patient.full_name,
        patient.phone,
        patient.email,
      ].some((value) => String(value || '').toLowerCase().includes(query)),
    )
  }, [patients, search])

  function changePatientForm(event) {
    const { name, value } = event.target
    setPatientForm((current) => ({ ...current, [name]: value }))
  }

  function resetPatientForm() {
    setPatientForm(emptyPatient)
    setEditingId(null)
  }

  function startEdit(patient) {
    setPatientForm({
      full_name: patient.full_name || '',
      date_of_birth: patient.date_of_birth || '',
      gender: patient.gender || 'Male',
      phone: patient.phone || '',
      email: patient.email || '',
      address: patient.address || '',
      blood_group: patient.blood_group || '',
      emergency_contact_name: patient.emergency_contact_name || '',
      emergency_contact_phone: patient.emergency_contact_phone || '',
    })
    setEditingId(patient.id)
    setError('')
    setSuccess('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submitPatient(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)

    try {
      if (editingId !== null) {
        await updatePatient(editingId, patientForm)
        setSuccess('Patient details updated successfully.')
      } else {
        await createPatient(patientForm)
        setSuccess('Patient registered successfully.')
      }

      resetPatientForm()
      await loadPatients()
    } catch (err) {
      notifyError(err)
    } finally {
      setSaving(false)
    }
  }

  async function removePatient(patient) {
    if (!window.confirm(`Deactivate patient "${patient.full_name}"?`)) return

    setError('')
    setSuccess('')

    try {
      await deactivatePatient(patient.id)
      setSuccess('Patient deactivated successfully.')
      await loadPatients()
    } catch (err) {
      notifyError(err)
    }
  }

  async function submitBooking(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)

    try {
      await createBooking({
        patient: Number(bookingForm.patient),
        doctor: Number(bookingForm.doctor),
        date: bookingForm.date,
      })
      setBookingForm(emptyBooking)
      setSuccess(
        'Appointment booking created. The token is generated after the registration bill is paid.',
      )
      await loadBookings()
    } catch (err) {
      notifyError(err)
    } finally {
      setSaving(false)
    }
  }

  async function createBill(patientId) {
    setError('')
    setSuccess('')
    setSaving(true)

    try {
      await createRegistrationBill(Number(patientId))
      setSuccess('Registration bill created or retrieved.')
      await loadBills()
    } catch (err) {
      notifyError(err)
    } finally {
      setSaving(false)
    }
  }

  async function payBill(bill) {
    if (!window.confirm(`Mark registration bill #${bill.id} as paid?`)) return

    setError('')
    setSuccess('')
    setSaving(true)

    try {
      await payRegistrationBill(bill.id)
      setSuccess('Registration bill payment processed.')
      await Promise.all([loadBills(), loadTokens(), loadBookings()])
    } catch (err) {
      notifyError(err)
    } finally {
      setSaving(false)
    }
  }

  const patientName = (id) =>
    patients.find((patient) => patient.id === Number(id))?.full_name ||
    `Patient #${id ?? '—'}`

  const doctorName = (id) => {
    const doctor = doctors.find((item) => item.id === Number(id))
    return doctor?.full_name || `Doctor #${id ?? '—'}`
  }

  function statusBadge(status) {
    const safeStatus = display(status)
    return <span className="status-badge">{safeStatus}</span>
  }

  function renderPatients() {
    return (
      <>
        <section className="stats-grid">
          <article className="stat-card">
            <span className="stat-label">Active patients loaded</span>
            <strong>{patients.length}</strong>
            <span className="stat-note">From Django</span>
          </article>
          <article className="stat-card">
            <span className="stat-label">Search results</span>
            <strong>{filteredPatients.length}</strong>
            <span className="stat-note">Matching records</span>
          </article>
          <article className="stat-card">
            <span className="stat-label">Patient management</span>
            <strong>Live</strong>
            <span className="stat-note">API connected</span>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">
                  {editingId !== null ? 'EDIT RECORD' : 'NEW RECORD'}
                </span>
                <h2>{editingId !== null ? 'Edit patient' : 'Register patient'}</h2>
              </div>
            </div>

            <form onSubmit={submitPatient}>
              <div className="form-grid">
                <label className="field full-width">
                  Full name *
                  <input name="full_name" value={patientForm.full_name}
                    onChange={changePatientForm} required minLength={2} />
                </label>

                <label className="field">
                  Date of birth *
                  <input type="date" name="date_of_birth"
                    value={patientForm.date_of_birth}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={changePatientForm} required />
                </label>

                <label className="field">
                  Gender *
                  <select name="gender" value={patientForm.gender}
                    onChange={changePatientForm} required>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </label>

                <label className="field">
                  Phone *
                  <input name="phone" type="tel" value={patientForm.phone}
                    onChange={changePatientForm} required />
                </label>

                <label className="field">
                  Email
                  <input name="email" type="email" value={patientForm.email}
                    onChange={changePatientForm} />
                </label>

                <label className="field">
                  Blood group
                  <select name="blood_group" value={patientForm.blood_group}
                    onChange={changePatientForm}>
                    <option value="">Not provided</option>
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((group) =>
                      <option key={group} value={group}>{group}</option>
                    )}
                  </select>
                </label>

                <label className="field full-width">
                  Address *
                  <textarea name="address" value={patientForm.address}
                    onChange={changePatientForm} rows={2} required />
                </label>

                <label className="field">
                  Emergency contact name
                  <input name="emergency_contact_name"
                    value={patientForm.emergency_contact_name}
                    onChange={changePatientForm} />
                </label>

                <label className="field">
                  Emergency contact phone
                  <input name="emergency_contact_phone"
                    value={patientForm.emergency_contact_phone}
                    onChange={changePatientForm} />
                </label>
              </div>

              <div className="form-actions">
                <button className="secondary-button" type="button"
                  onClick={resetPatientForm}>Clear</button>
                <button className="primary-button" disabled={saving} type="submit">
                  {saving ? 'Saving...' : editingId !== null ? 'Save changes' : '+ Register patient'}
                </button>
              </div>
            </form>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">PATIENT DIRECTORY</span>
                <h2>Registered patients</h2>
              </div>
              <button className="secondary-button" onClick={loadPatients} type="button">
                Refresh
              </button>
            </div>

            <input className="search-input" value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone, email or ID" />

            {loading ? <p>Loading patients...</p> : filteredPatients.length === 0
              ? <p className="empty-state">No patients found.</p>
              : <div className="table-wrap">
                <table>
                  <thead><tr><th>Patient</th><th>Phone</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filteredPatients.map((patient) => (
                      <tr key={patient.id}>
                        <td>
                          <strong>{patient.full_name}</strong>
                          <small>Patient #{patient.id}</small>
                        </td>
                        <td>{patient.phone}</td>
                        <td className="action-cell">
                          <button className="text-button" type="button"
                            onClick={() => startEdit(patient)}>Edit</button>
                          <button className="danger-button" type="button"
                            onClick={() => removePatient(patient)}>Deactivate</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
          </article>
        </section>
      </>
    )
  }

  function renderDoctors() {
    return (
      <section className="panel">
        <div className="panel-heading">
          <div><span className="eyebrow">CLINICAL TEAM</span><h2>Available doctors</h2></div>
          <button className="secondary-button" type="button" onClick={loadDoctors}>Refresh</button>
        </div>
        {loading ? <p>Loading doctors...</p> : doctors.length === 0
          ? <p className="empty-state">No active doctors were returned. Add an active Doctor staff record and DoctorProfile in Django admin.</p>
          : <div className="table-wrap">
            <table>
              <thead><tr><th>Doctor</th><th>Department</th><th>Consultation fee</th><th>Status</th></tr></thead>
              <tbody>{doctors.map((doctor) => (
                <tr key={doctor.id}>
                  <td><strong>{doctor.full_name || `Doctor #${doctor.id}`}</strong>
                    <small>{doctor.medical_license_number || 'License not listed'}</small></td>
                  <td>{doctor.department_name || doctor.department || '—'}</td>
                  <td>{doctor.consultation_fee ?? '—'}</td>
                  <td>{statusBadge(doctor.is_active ? 'Active' : 'Inactive')}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>}
      </section>
    )
  }

  function renderAppointments() {
    return (
      <>
        <section className="panel">
          <div className="panel-heading">
            <div><span className="eyebrow">NEW BOOKING</span><h2>Book an appointment</h2></div>
          </div>
          <form onSubmit={submitBooking}>
            <div className="form-grid">
              <label className="field">
                Patient *
                <select required value={bookingForm.patient}
                  onChange={(event) => setBookingForm({ ...bookingForm, patient: event.target.value })}>
                  <option value="">Select patient</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.full_name} (#{patient.id})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Doctor *
                <select required value={bookingForm.doctor}
                  onChange={(event) => setBookingForm({ ...bookingForm, doctor: event.target.value })}>
                  <option value="">Select doctor</option>
                  {doctors.filter((doctor) => doctor.is_active !== false).map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.full_name || `Doctor #${doctor.id}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Appointment date *
                <input type="date" required min={new Date().toISOString().slice(0, 10)}
                  value={bookingForm.date}
                  onChange={(event) => setBookingForm({ ...bookingForm, date: event.target.value })} />
              </label>
            </div>
            <p className="helper-text">
              Booking tokens are generated after the registration bill is paid, according to your backend workflow.
            </p>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Create booking'}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div><span className="eyebrow">SCHEDULE</span><h2>Appointments</h2></div>
            <button className="secondary-button" type="button"
              onClick={async () => {
                try { await Promise.all([loadBookings(), loadPatients(), loadDoctors()]) }
                catch (err) { notifyError(err) }
              }}>Refresh</button>
          </div>
          {loading ? <p>Loading appointments...</p> : bookings.length === 0
            ? <p className="empty-state">No bookings found.</p>
            : <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Patient</th><th>Doctor</th><th>Booking token</th><th>Status</th></tr></thead>
                <tbody>{bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td>{display(booking.date)}</td>
                    <td>{booking.patient_name || patientName(booking.patient)}</td>
                    <td>{booking.doctor_name || doctorName(booking.doctor)}</td>
                    <td>{display(booking.reserved_token_number)}</td>
                    <td>{statusBadge(booking.status)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>}
        </section>
      </>
    )
  }

  function renderBilling() {
    return (
      <>
        <section className="panel">
          <div className="panel-heading">
            <div><span className="eyebrow">REGISTRATION</span><h2>Create registration bill</h2></div>
          </div>
          <form onSubmit={(event) => {
            event.preventDefault()
            const patientId = event.currentTarget.patient_id.value
            if (patientId) createBill(patientId)
          }}>
            <div className="form-grid">
              <label className="field">
                Select patient *
                <select name="patient_id" required defaultValue="">
                  <option value="">Select patient</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.full_name} (#{patient.id})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="primary-button" type="submit" disabled={saving}>
              Create or retrieve bill
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div><span className="eyebrow">PAYMENTS</span><h2>Registration bills</h2></div>
            <button className="secondary-button" type="button" onClick={loadBills}>Refresh</button>
          </div>
          {loading ? <p>Loading bills...</p> : bills.length === 0
            ? <p className="empty-state">No registration bills found.</p>
            : <div className="table-wrap">
              <table>
                <thead><tr><th>Bill</th><th>Patient</th><th>Amount</th><th>Payment status</th><th>Action</th></tr></thead>
                <tbody>{bills.map((bill) => (
                  <tr key={bill.id}>
                    <td>#{bill.id}</td>
                    <td>{bill.patient_name || patientName(bill.patient)}</td>
                    <td>{bill.registration_fee ?? bill.total ?? '—'}</td>
                    <td>{statusBadge(bill.payment_status)}</td>
                    <td>
                      {bill.payment_status === 'Paid'
                        ? <span className="paid-text">Paid</span>
                        : <button className="primary-button small-button" type="button"
                          disabled={saving} onClick={() => payBill(bill)}>Mark paid</button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>}
          <p className="helper-text">
            Paying a registration bill may activate eligible bookings and generate appointment tokens through your Django backend.
          </p>
        </section>
      </>
    )
  }

  function renderTokens() {
    return (
      <section className="panel">
        <div className="panel-heading">
          <div><span className="eyebrow">LIVE QUEUE</span><h2>Token queue</h2></div>
          <button className="secondary-button" type="button" onClick={loadTokens}>Refresh</button>
        </div>
        {loading ? <p>Loading tokens...</p> : tokens.length === 0
          ? <p className="empty-state">No tokens found. Tokens may appear after registration bills are paid.</p>
          : <div className="table-wrap">
            <table>
              <thead><tr><th>Token</th><th>Patient</th><th>Doctor</th><th>Date</th><th>Type</th><th>Status</th></tr></thead>
              <tbody>{tokens.map((token) => (
                <tr key={token.id}>
                  <td><strong>#{display(token.token_number)}</strong></td>
                  <td>{token.patient_name || patientName(token.patient)}</td>
                  <td>{token.doctor_name || doctorName(token.doctor)}</td>
                  <td>{display(token.date)}</td>
                  <td>{display(token.token_type)}</td>
                  <td>{statusBadge(token.status)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>}
      </section>
    )
  }

  const pageDescriptions = {
    Patients: 'Register patients and keep their details up to date.',
    Appointments: 'Book appointments and track booking status.',
    Doctors: 'View active doctors and consultation details.',
    Billing: 'Create registration bills and record payments.',
    'Token queue': 'View generated tokens and their current status.',
  }

  function renderPage() {
    if (activePage === 'Patients') return renderPatients()
    if (activePage === 'Doctors') return renderDoctors()
    if (activePage === 'Appointments') return renderAppointments()
    if (activePage === 'Billing') return renderBilling()
    if (activePage === 'Token queue') return renderTokens()
    return null
  }

  return (
    <div className="clinic-app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">+</div>
          <div><h2>CarePoint</h2><span>Clinic Management</span></div>
        </div>

        <p className="nav-heading">WORKSPACE</p>
        <nav>
          {pages.map((page, index) => (
            <button key={page} type="button"
              className={`nav-item ${activePage === page ? 'active' : ''}`}
              onClick={() => {
                setActivePage(page)
                setError('')
                setSuccess('')
              }}>
              <span>{['▦', '♧', '◉', '₹', '▤'][index]}</span>{page}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" />Reception workspace
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">CLINIC / RECEPTION</span>
            <h1>{activePage === 'Token queue' ? 'Token Queue' : activePage === 'Billing' ? 'Billing Management' : activePage === 'Appointments' ? 'Appointment Management' : activePage === 'Doctors' ? 'Doctor Directory' : 'Patient Management'}</h1>
          </div>
          <div className="user-chip">
            <div className="avatar">R</div>
            <div><strong>Receptionist</strong><span>Clinic staff</span></div>
          </div>
        </header>

        <section className="welcome-banner">
          <div>
            <span className="banner-label">RECEPTION DESK</span>
            <h2>Welcome to your workspace</h2>
            <p>{pageDescriptions[activePage]}</p>
          </div>
          <div className="banner-symbol">✚</div>
        </section>

        {error && <div className="alert error-alert" role="alert">
          <strong>Something went wrong</strong><p>{error}</p>
        </div>}
        {success && <div className="alert success-alert" role="status">{success}</div>}

        {renderPage()}

        <footer className="app-footer">
          Clinic Management System <span>•</span> Reception module
        </footer>
      </main>
    </div>
  )
}

export default App
