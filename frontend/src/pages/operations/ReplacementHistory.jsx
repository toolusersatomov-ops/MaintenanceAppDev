import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import DataTable from "@/components/shared/DataTable";
import useAssignedMachines from "@/hooks/useAssignedMachines";
import api from "@/lib/api";

const columns = [
  { key: "ingredient_name", label: "Ingredient" },
  { key: "old_bin_id", label: "Old Bin", mono: true },
  { key: "new_bin_id", label: "New Bin", mono: true },
  { key: "assigned_operations_staff", label: "Staff" },
  { key: "created_at", label: "Date", mono: true, render: (r) => new Date(r.created_at).toLocaleString() },
];

export default function ReplacementHistory() {
  const [params] = useSearchParams();
  const { options } = useAssignedMachines();
  const [machineId, setMachineId] = useState(params.get("machine") || "");
  const [rows, setRows] = useState([]);

  useEffect(() => { if (options.length && !machineId) setMachineId(options[0].value); }, [options, machineId]);

  const load = useCallback(() => {
    if (!machineId) return;
    api.get(`/operations/replacement-history?machine_id=${machineId}`).then(({ data }) => setRows(data));
  }, [machineId]);
  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="replacement-history-page">
      <PageHeader title="Replacement History" description="Completed bin replacements for the selected machine" />
      <div className="max-w-md mb-4">
        <SearchableSelect options={options} value={machineId} onChange={setMachineId} testId="replacement-history-machine-select" />
      </div>
      <DataTable columns={columns} rows={rows} testId="replacement-history-table" />
    </div>
  );
}
