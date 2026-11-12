import { Navigate, useParams } from "react-router-dom";

function PrescriptionDetails() {
  const { id } = useParams();
  return <Navigate to={`/pharmacy/prescriptions?open=${id}`} replace />;
}

export default PrescriptionDetails;
