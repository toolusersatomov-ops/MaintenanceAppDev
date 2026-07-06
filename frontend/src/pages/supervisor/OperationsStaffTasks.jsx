import React, { useEffect, useState, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

const PRIORITIES = [{ value: "Low", label: "Low" }, { value: "Medium", label: "Medium" }, { value: "High", label: "High" }];

export default function OperationsStaffTasks() {
  const [data, setData] = useState({ pickup_tasks: [], bin_replacement_tasks: [], cleaning_tasks: [], dirty_bin_returns: [] });
  const [machines, setMachines] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [machineFilter, setMachineFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [comments, setComments] = useState({});
  const { toast } = useToast();

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (machineFilter) params.set("machine_id", machineFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (staffFilter) params.set("assigned_to", staffFilter);
    api.get(`/supervisor/operations-staff-tasks?${params.toString()}`).then(({ data }) => setData(data));
  }, [machineFilter, statusFilter, staffFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/catalog/machines").then(({ data }) => setMachines(data.map((m) => ({ value: m.id, label: m.label }))));
    api.get("/supervisor/users").then(({ data }) => setStaffOptions(data.filter((u) => u.role === "operations_staff").map((u) => ({ value: u.username, label: `${u.name} (${u.username})` }))));
  }, []);

  const call = async (fn, msg) => {
    try {
      const { data } = await fn();
      toast({ title: msg || data.message });
      load();
    } catch (e) {
      toast({ title: "Action failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const reassign = (taskId, staff) => call(() => api.post(`/supervisor/tasks/${taskId}/reassign`, { operations_staff: staff }));
  const setPriority = (taskId, priority) => call(() => api.post(`/supervisor/tasks/${taskId}/priority`, { priority }));
  const submitComment = (taskId) => {
    const comment = comments[taskId];
    if (!comment) return;
    call(() => api.post(`/supervisor/tasks/${taskId}/comment`, { comment }), "Comment added");
    setComments((c) => ({ ...c, [taskId]: "" }));
  };

  const statusCol = { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> };

  const actionsCol = {
    key: "actions", label: "Actions",
    render: (r) => (
      <div className="flex flex-col gap-1.5 min-w-[220px]" data-testid={`task-actions-${r.id}`}>
        <SearchableSelect
          options={staffOptions} value={r.assigned_operations_staff || ""}
          onChange={(v) => reassign(r.id, v)} placeholder="Reassign staff" testId={`reassign-select-${r.id}`}
        />
        <SearchableSelect
          options={PRIORITIES} value={r.priority || ""}
          onChange={(v) => setPriority(r.id, v)} placeholder="Set priority" testId={`priority-select-${r.id}`}
        />
        <div className="flex gap-1">
          <Input
            value={comments[r.id] || ""} onChange={(e) => setComments((c) => ({ ...c, [r.id]: e.target.value }))}
            placeholder="Add comment" className="bg-bone h-8 text-xs" data-testid={`comment-input-${r.id}`}
          />
          <Button size="sm" variant="outline" onClick={() => submitComment(r.id)} data-testid={`comment-submit-${r.id}`}>Add</Button>
        </div>
      </div>
    ),
  };

  return (
    <div data-testid="operations-staff-tasks-page">
      <PageHeader title="Operations Staff Tasks" description="All field-team tasks across pickup, replacement, cleaning, and dirty bin return" />

      <div className="flex flex-wrap gap-3 mb-4 max-w-3xl">
        <div className="w-48"><SearchableSelect options={machines} value={machineFilter} onChange={setMachineFilter} placeholder="Filter by Machine" testId="filter-machine" /></div>
        <div className="w-44"><SearchableSelect options={[{ value: "Pending Prep", label: "Pending Prep" }, { value: "Ready for Pickup", label: "Ready for Pickup" }, { value: "Picked", label: "Picked" }, { value: "Completed", label: "Completed" }]} value={statusFilter} onChange={setStatusFilter} placeholder="Filter by Status" testId="filter-status" /></div>
        <div className="w-52"><SearchableSelect options={staffOptions} value={staffFilter} onChange={setStaffFilter} placeholder="Filter by Staff" testId="filter-staff" /></div>
        {(machineFilter || statusFilter || staffFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setMachineFilter(""); setStatusFilter(""); setStaffFilter(""); }} data-testid="filter-clear-btn">Clear</Button>
        )}
      </div>

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
            { key: "assigned_operations_staff", label: "Staff" }, { key: "stage", label: "Stage" }, statusCol, actionsCol,
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
