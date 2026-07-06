import React, { useEffect, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import api from "@/lib/api";

export default function TechnicianWorkload() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/maintenance/workload").then(({ data }) => setRows(data)); }, []);

  return (
    <div data-testid="technician-workload-page">
      <PageHeader title="Technician Workload" description="Active and closed work orders per technician" />
      <DataTable
        testId="technician-workload-table"
        columns={[
          { key: "technician", label: "Technician", mono: true }, { key: "name", label: "Name" },
          { key: "active_work_orders", label: "Active", mono: true }, { key: "closed_work_orders", label: "Closed", mono: true },
        ]}
        rows={rows}
      />
    </div>
  );
}
