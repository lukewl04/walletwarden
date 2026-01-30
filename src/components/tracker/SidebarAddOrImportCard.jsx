import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

export default function SidebarAddOrImportCard({ prefersReducedMotion }) {
  return (
    <motion.div
      className="card shadow-sm mb-3 tracker-card-hover"
      whileHover={prefersReducedMotion ? undefined : { y: -2, boxShadow: "0 10px 24px rgba(13,110,253,0.12)" }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
    >
      <div className="card-body">
        <h6 className="mb-3">Add or Import</h6>

        <Link to="/wardeninsights" className="btn btn-primary w-100 mb-2" title="Add transactions or income in Warden Insights">
          Add
        </Link>

        <div className="text-body small">Manage all new expenses and income from Warden Insights; they'll sync back here.</div>
      </div>
    </motion.div>
  );
}
