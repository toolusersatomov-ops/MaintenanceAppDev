import React, { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import DataTable from "@/components/shared/DataTable";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function SparePartsInventory() {
  const [rows, setRows] = useState([]);
  const { toast } = useToast();

  const load = useCallback(() => { api.get("/maintenance-sup/spare-parts-inventory").then(({ data }) => setRows(data)); }, []);
  useEffect(() => { load(); }, [load]);

  const adjust = async (part, delta) => {
    try {
      const { data } = await api.post(`/maintenance-sup/spare-parts-inventory/${part.id}/adjust`, { delta });
      toast({ title: data.message });
      load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const columns = [
    { key: "part_code", label: "Part Code", mono: true },
    { key: "part_name", label: "Part Name" },
    { key: "category", label: "Category" },
    { key: "total_stock", label: "Total Stock" },
    { key: "assigned_qty", label: "Assigned to Technicians" },
    { key: "available_stock", label: "Available Stock" },
    { key: "min_stock", label: "Minimum Stock" },
    { key: "reorder_status", label: "Reorder Status", render: (r) => <StatusBadge status={r.reorder_status} /> },
    { key: "actions", label: "Adjust", render: (r) => (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => adjust(r, 5)} data-testid={`stock-add-${r.part_code}`}>+5</Button>
          <Button size="sm" variant="outline" onClick={() => adjust(r, -1)} data-testid={`stock-remove-${r.part_code}`}>-1</Button>
        </div>
      ) },
  ];

  return (
    <div data-testid="spare-parts-inventory-page">
      <PageHeader title="Spare Parts Inventory" description="Central spare parts store with technician allocations and reorder status" />
      <DataTable columns={columns} rows={rows} testId="spare-parts-inventory-table" emptyText="No spare parts in the store." />
    </div>
  );
}
