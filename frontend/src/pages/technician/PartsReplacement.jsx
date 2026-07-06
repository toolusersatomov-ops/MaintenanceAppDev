import React, { useEffect, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

export default function PartsReplacement() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get(`/maintenance/spare-parts-requests?technician=${user.username}&status=Approved`).then(({ data }) => setRows(data)); }, [user.username]);

  return (
    <div data-testid="parts-replacement-page">
      <PageHeader title="Parts Replacement" description="Spare parts approved and ready to be fitted during repair" />
      <DataTable
        testId="parts-replacement-table"
        columns={[
          { key: "part_name", label: "Part" }, { key: "quantity", label: "Qty", mono: true },
          { key: "machine_label", label: "Machine" }, { key: "reason", label: "Reason" },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={rows}
      />
    </div>
  );
}
