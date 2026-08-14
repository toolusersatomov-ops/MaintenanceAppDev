import React, { useEffect, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import ReportViewer from "@/components/shared/ReportViewer";
import { useMeta } from "@/components/maint/useMaint";
import api from "@/lib/api";

export default function Reports() {
  const meta = useMeta();
  const [technicians, setTechnicians] = useState([]);
  useEffect(() => { api.get("/maintenance/technicians").then(({ data }) => setTechnicians(data)); }, []);

  const extraFilters = [
    { key: "technician", label: "All Technicians", options: technicians.map((t) => ({ value: t.username, label: t.name })) },
    { key: "component", label: "All Components", options: (meta?.component_categories || []).map((c) => ({ value: c, label: c })) },
    { key: "priority", label: "All Priorities", options: (meta?.priorities || []).map((p) => ({ value: p, label: p })) },
    { key: "status", label: "All Statuses", options: (meta?.wo_statuses || []).map((s) => ({ value: s, label: s })) },
  ];

  return (
    <div data-testid="maintenance-reports-page">
      <PageHeader title="Maintenance Reports" description="Work orders, downtime, MTTR, PM compliance, calibration, parts and technician productivity" />
      <ReportViewer reportList={meta?.reports || []} extraFilters={extraFilters} testId="maintenance-report-viewer" />
    </div>
  );
}
