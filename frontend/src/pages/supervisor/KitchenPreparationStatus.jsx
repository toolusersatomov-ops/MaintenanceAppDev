import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import api from "@/lib/api";

export default function KitchenPreparationStatus() {
  const [params] = useSearchParams();
  const statusFilter = params.get("status") || "";
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/supervisor/kitchen-preparation-status").then(({ data }) => setRows(statusFilter ? data.filter((r) => r.status === statusFilter) : data)); }, [statusFilter]);

  return (
    <div data-testid="kitchen-preparation-status-page">
      <PageHeader title="Kitchen Preparation Status" description={statusFilter ? `Filtered by status: ${statusFilter}` : "Track every kitchen fill ticket end-to-end"} />
      <DataTable
        testId="kitchen-preparation-status-table"
        columns={[
          { key: "machine_label", label: "Machine" }, { key: "ingredient_name", label: "Ingredient" },
          { key: "quantity", label: "Quantity", mono: true, render: (r) => `${r.quantity} ${r.unit}` },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "requested_at", label: "Requested At", mono: true, render: (r) => new Date(r.requested_at).toLocaleString() },
        ]}
        rows={rows}
      />
    </div>
  );
}
