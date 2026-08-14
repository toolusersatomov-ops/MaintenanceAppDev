import React, { useEffect, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import DataTable from "@/components/shared/DataTable";
import { useMachines, machineOptions, fmt } from "@/components/maint/useMaint";
import api from "@/lib/api";

export default function ServiceHistory() {
  const { machines } = useMachines();
  const [machineId, setMachineId] = useState("");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api.get(`/maintenance/service-history${machineId ? `?machine_id=${machineId}` : ""}`).then(({ data }) => setRows(data));
  }, [machineId]);

  const columns = [
    { key: "date", label: "Date", render: (r) => fmt(r.date) },
    { key: "machine_label", label: "Machine" },
    { key: "work_order_ref", label: "Work Order", mono: true },
    { key: "issue", label: "Issue" },
    { key: "diagnosis", label: "Diagnosis" },
    { key: "component", label: "Component" },
    { key: "repair", label: "Repair" },
    { key: "parts_used", label: "Parts Used", render: (r) => (r.parts_used || []).join(", ") || "\u2014" },
    { key: "calibration_performed", label: "Calibration", render: (r) => (r.calibration_performed || []).join(", ") || "\u2014" },
    { key: "test_result", label: "Test Result" },
    { key: "downtime_minutes", label: "Downtime (min)" },
    { key: "technician", label: "Technician" },
    { key: "supervisor_review", label: "Supervisor Review" },
    { key: "final_status", label: "Final Status", render: (r) => <StatusBadge status={r.final_status} /> },
  ];

  return (
    <div data-testid="service-history-page">
      <PageHeader title="Service History" description="Completed technical work you have carried out" />
      <div className="max-w-md mb-4">
        <SearchableSelect options={[{ value: "", label: "All Machines" }, ...machineOptions(machines)]}
                           value={machineId} onChange={setMachineId} placeholder="Filter by machine" testId="service-history-machine-filter" />
      </div>
      <DataTable columns={columns} rows={rows} testId="service-history-table" emptyText="No completed service records yet." />
    </div>
  );
}
