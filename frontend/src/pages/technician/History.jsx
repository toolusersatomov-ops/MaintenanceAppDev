import React, { useEffect, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

export default function TechHistory() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get(`/maintenance/work-orders?technician=${user.username}&status=Closed`).then(({ data }) => setRows(data)); }, [user.username]);

  return (
    <div data-testid="maintenance-history-page">
      <PageHeader title="Maintenance History" description="Your completed and closed work orders" />
      <DataTable
        testId="maintenance-history-table"
        columns={[
          { key: "machine_label", label: "Machine" }, { key: "title", label: "Title" }, { key: "type", label: "Type" },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "closed_at", label: "Closed At", mono: true, render: (r) => r.closed_at ? new Date(r.closed_at).toLocaleString() : "\u2014" },
        ]}
        rows={rows}
      />
    </div>
  );
}
