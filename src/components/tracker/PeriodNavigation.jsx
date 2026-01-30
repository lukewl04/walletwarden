import React from "react";

export default function PeriodNavigation({
  viewMode,
  weekStart,
  weekEnd,
  monthStart,
  yearStart,
  previousWeek,
  nextWeek,
  goToCurrentWeek,
  previousMonth,
  nextMonth,
  goToCurrentMonth,
  previousYear,
  nextYear,
  goToCurrentYear,
}) {
  return (
    <div className="d-flex align-items-center justify-content-between mb-4 pb-3 border-bottom">
      <h5 className="mb-0">
        {viewMode === "yearly"
          ? yearStart.getFullYear().toString()
          : viewMode === "monthly"
          ? monthStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
          : `Week of ${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} - ${weekEnd.toLocaleDateString(
              "en-GB",
              { day: "numeric", month: "short", year: "numeric" }
            )}`}
      </h5>
      <div className="d-flex gap-2 align-items-center">
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={viewMode === "yearly" ? previousYear : viewMode === "monthly" ? previousMonth : previousWeek}
          title={viewMode === "yearly" ? "Previous year" : viewMode === "monthly" ? "Previous month" : "Previous week"}
        >
          ← Prev
        </button>
        <button
          className="btn btn-sm btn-outline-primary"
          onClick={viewMode === "yearly" ? goToCurrentYear : viewMode === "monthly" ? goToCurrentMonth : goToCurrentWeek}
          title={viewMode === "yearly" ? "Go to current year" : viewMode === "monthly" ? "Go to current month" : "Go to current week"}
        >
          Today
        </button>
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={viewMode === "yearly" ? nextYear : viewMode === "monthly" ? nextMonth : nextWeek}
          title={viewMode === "yearly" ? "Next year" : viewMode === "monthly" ? "Next month" : "Next week"}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
