import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Minus } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import api from "@/lib/api";

export default function SparePartsInventory() {
  const [rows, setRows] = useState([]);
  const load = () => api.get("/maintenance/spare-parts-inventory").then(({ data }) => setRows(data));
  useEffect(() => { load(); }, []);

  const adjust = async (id, delta) => {
    await api.post(`/maintenance/spare-parts-inventory/${id}/adjust`, { delta });
    load();
  };

  return (
    <div data-testid="spare-parts-inventory-page">
      <PageHeader title="Spare Parts Inventory" description="Stock levels for spare parts across the fleet" />
      <DataTable
        testId="spare-parts-inventory-table"
        columns={[
          { key: "name", label: "Part" },
          { key: "stock", label: "Stock", mono: true, render: (r) => (
            <span className="flex items-center gap-2">
              <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => adjust(r.id, -1)} data-testid={`decrease-stock-${r.id}`}><Minus className="h-3 w-3" /></Button>
              {r.stock}
              <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => adjust(r.id, 1)} data-testid={`increase-stock-${r.id}`}><Plus className="h-3 w-3" /></Button>
            </span>
          ) },
          { key: "reorder_level", label: "Reorder Level", mono: true },
          { key: "unit_cost", label: "Unit Cost", mono: true, render: (r) => `\u20b9${r.unit_cost}` },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.stock <= r.reorder_level ? "Low Stock" : "Normal"} /> },
        ]}
        rows={rows}
      />
    </div>
  );
}
