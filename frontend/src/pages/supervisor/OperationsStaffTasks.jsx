import React, { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import api from "@/lib/api";

export default function OperationsStaffTasks() {
  const [data, setData] = useState({ pickup_tasks: [], bin_replacement_tasks: [], cleaning_tasks: [], dirty_bin_returns: [] });
  useEffect(() => { api.get("/supervisor/operations-staff-tasks").then(({ data }) => setData(data)); }, []);

  const statusCol = { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> };

  return (
    <div data-testid="operations-staff-tasks-page">
      <PageHeader title="Operations Staff Tasks" description="All field-team tasks across pickup, replacement, cleaning, and dirty bin return" />
      <Tabs defaultValue="pickup">
        <TabsList className="bg-oat flex-wrap h-auto">
          <TabsTrigger value="pickup" data-testid="tab-pickup-tasks">Pickup ({data.pickup_tasks.length})</TabsTrigger>
          <TabsTrigger value="replacement" data-testid="tab-replacement-tasks">Bin Replacement ({data.bin_replacement_tasks.length})</TabsTrigger>
          <TabsTrigger value="cleaning" data-testid="tab-cleaning-tasks">Cleaning ({data.cleaning_tasks.length})</TabsTrigger>
          <TabsTrigger value="dirty" data-testid="tab-dirty-bin-tasks">Dirty Bin Return ({data.dirty_bin_returns.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pickup">
          <DataTable testId="pickup-tasks-table" columns={[
            { key: "machine_label", label: "Machine" }, { key: "ingredient_name", label: "Ingredient" },
            { key: "assigned_operations_staff", label: "Staff" }, statusCol,
          ]} rows={data.pickup_tasks} />
        </TabsContent>
        <TabsContent value="replacement">
          <DataTable testId="replacement-tasks-table" columns={[
            { key: "machine_label", label: "Machine" }, { key: "ingredient_name", label: "Ingredient" },
            { key: "assigned_operations_staff", label: "Staff" }, { key: "stage", label: "Stage" }, statusCol,
          ]} rows={data.bin_replacement_tasks} />
        </TabsContent>
        <TabsContent value="cleaning">
          <DataTable testId="cleaning-tasks-table" columns={[
            { key: "machine_label", label: "Machine" }, { key: "date", label: "Date" }, statusCol,
          ]} rows={data.cleaning_tasks} />
        </TabsContent>
        <TabsContent value="dirty">
          <DataTable testId="dirty-bin-tasks-table" columns={[
            { key: "machine_label", label: "Machine" }, { key: "ingredient_name", label: "Ingredient" },
            { key: "returned_by", label: "Returned By" }, statusCol,
          ]} rows={data.dirty_bin_returns} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
