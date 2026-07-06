import React from "react";
import PageHeader from "@/components/shared/PageHeader";
import ReportViewer from "@/components/shared/ReportViewer";

const MAINTENANCE_REPORTS = [
  ["work_order_summary", "Work Order Summary"], ["machine_downtime", "Machine Downtime"],
  ["pm_compliance", "Preventive Maintenance Compliance"], ["technician_productivity", "Technician Productivity"],
  ["spare_parts_usage", "Spare Parts Usage"], ["repeated_failure", "Repeated Failure"],
  ["machine_health_score", "Machine Health Score"], ["repair_turnaround", "Repair Turnaround Time"],
];

export default function Reports() {
  return (
    <div data-testid="maintenance-reports-page">
      <PageHeader title="Maintenance Reports" description="Work orders, downtime, PM compliance, and technician productivity" />
      <ReportViewer reportList={MAINTENANCE_REPORTS} testId="maintenance-report-viewer" />
    </div>
  );
}
