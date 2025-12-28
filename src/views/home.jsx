import Navbar from "../components/navbar.jsx";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="container-fluid py-5 mt-5" style={{ minHeight: "100vh" }}>
      <Navbar />

      <div className="container text-center" style={{ maxWidth: 900 }}>
        {/* Hero */}
        <div className="mb-5">
          <h1 className="display-5 fw-bold mb-3">
            Control your money,<br className="d-none d-md-block" />
            before it controls you.
          </h1>

          <p className="lead text-muted mb-4">
            Track spending, split costs, and build better money habits — all in one place.
          </p>

          <div className="d-flex flex-column flex-sm-row gap-3 justify-content-center">
            <Link to="/wardeninsights" className="btn btn-primary btn-lg px-4 rounded-pill">
              View Insights
            </Link>

            <Link to="/splitmaker" className="btn btn-outline-secondary btn-lg px-4 rounded-pill">
              Split Expenses
            </Link>
          </div>
        </div>

        {/* Optional tagline */}
        <div className="text-muted small">
          Wallet Warden • Simple finance, done right
        </div>
      </div>
    </div>
  );
}
