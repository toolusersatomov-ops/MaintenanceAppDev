import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import DataTable from "@/components/shared/DataTable";
import api from "@/lib/api";

export default function TechnicianWorkload() {
  const [rows, setRows] = useState([]);
  const navigate = useNavigate();

  useEffect(() => { api.get("/maintenance-sup/workload").then(({ data }) => setRows(data)); }, []);

  const columns = [
    { key: "name", label: "Technician", render: (r) => <span>{r.name} <span className="font-mono text-xs text-ink/60">({r.technician})</span></span> },
    { key: "assigned_machine_count", label: "Assigned Machines" },
    { key: "active_work_orders", label: "Active Work Orders" },
    { key: "critical_tasks", label: "High / Critical" },
    { key: "waiting_for_parts", label: "Waiting for Parts" },
    { key: "overdue_tasks", label: "Overdue" },
    { key: "completed_today", label: "Completed Today" },
    { key: "current_task", label: "Current Task", render: (r) => r.current_task || "\u2014" },
    { key: "availability", label: "Availability", render: (r) => <StatusBadge status={r.availability} /> },
    { key: "actions", label: "", render: (r) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate("/maintenance-supervisor/assign-technician")} data-testid={`workload-assign-${r.technician}`}>Assign</Button>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/maintenance-supervisor/work-orders?technician=${r.technician}`)} data-testid={`workload-view-${r.technician}`}>View Tasks</Button>
        </div>
      ) },
  ];

  return (
    <div data-testid="technician-workload-page">
      <PageHeader title="Technician Workload" description="Live workload per technician for balanced assignment" />
      <DataTable columns={columns} rows={rows} testId="workload-table" emptyText="No technicians found." />
    </div>
  );
}
