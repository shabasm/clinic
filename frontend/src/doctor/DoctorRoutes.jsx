import { Navigate, Route, Routes } from "react-router-dom";
import "./Doctor.css";
import DoctorConsultation from "./pages/DoctorConsultation";
import DoctorPastConsultations from "./pages/DoctorPastConsultations";
import DoctorPatientHistory from "./pages/DoctorPatientHistory";
import DoctorQueue from "./pages/DoctorQueue";

function DoctorRoutes() {
  return (
    <Routes>
      <Route path="queue" element={<DoctorQueue />} />
      <Route path="dashboard" element={<Navigate to="/doctor/queue" replace />} />
      <Route path="consultation/:id" element={<DoctorConsultation />} />
      <Route path="consultation" element={<DoctorConsultation />} />
      <Route path="past-consultations" element={<DoctorPastConsultations />} />
      <Route path="patient-history" element={<DoctorPatientHistory />} />
      <Route path="*" element={<Navigate to="/doctor/queue" replace />} />
    </Routes>
  );
}

export default DoctorRoutes;
