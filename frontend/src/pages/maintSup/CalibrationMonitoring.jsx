import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import DataTable from "@/components/shared/DataTable";
import { useMeta, useMachines, machineOptions, fmt } from "@/components/maint/useMaint";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function CalibrationMonitoring() {
  const meta = useMeta();
  const { machines } = useMachines();
  const [params] = useSearchParams();
  const [filters, setFilters] = useState({ machine_id: "", result: params.get("result") || "", status: params.get("status") || "" });
  const [rows, setRows] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ technician: "", priority: "Medium", comment: "" });
  const { toast } = useToast();

  const load = useCallback(() => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && q.set(k, v));
    api.get(`/maintenance-sup/calibration-monitoring?${q.toString()}`).then(({ data }) => setRows(data));
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/maintenance/technicians").then(({ data }) => setTechnicians(data)); }, []);

  const assign = async () => {
    try {
      const { data } = await api.post(`/maintenance-sup/calibration-monitoring/${selected.id}/assign-recalibration`, {
        technician: form.technician || null, priority: form.priority, comment: form.comment || null,
      });
      toast({ title: data.message });
      setSelected(null); setForm({ technician: "", priority: "Medium", comment: "" }); load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const columns = [
    { key: "cal_id", label: "Calibration ID", mono: true },
    { key: "machine_label", label: "Machine" },
    { key: "slot_id", label: "Slot", mono: true },
    { key: "bin_id", label: "Bin ID", mono: true },
    { key: "item", label: "Item" },
    { key: "calibration_type", label: "Component / Type" },
    { key: "created_at", label: "Last Calibration", render: (r) => fmt(r.created_at) },
    { key: "result", label: "Result", render: (r) => <StatusBadge status={r.result} /> },
    { key: "technician", label: "Technician" },
    { key: "next_due", label: "Next Calibration Due", render: (r) => fmt(r.next_due) },
    { key: "monitor_status", label: "Status", render: (r) => <StatusBadge status={r.monitor_status} /> },
    { key: "recalibration_work_order_ref", label: "Recal. Work Order", mono: true },
    { key: "actions", label: "", render: (r) => (
        <Button size="sm" variant="outline" onClick={() => setSelected(r)} data-testid={`assign-recal-${r.cal_id}`}>Assign Recalibration</Button>
      ) },
  ];

  return (
    <div data-testid="calibration-monitoring-page">
      <PageHeader title="Calibration Monitoring" description="Track dispense accuracy per slot and bin, and assign recalibration work" />

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="w-56"><SearchableSelect options={[{ value: "", label: "All Machines" }, ...machineOptions(machines)]}
          value={filters.machine_id} onChange={(v) => setFilters({ ...filters, machine_id: v })} placeholder="Machine" testId="calmon-filter-machine" /></div>
        <div className="w-40"><SearchableSelect options={[{ value: "", label: "All Results" }, { value: "PASS", label: "PASS" }, { value: "FAIL", label: "FAIL" }]}
          value={filters.result} onChange={(v) => setFilters({ ...filters, result: v })} placeholder="Result" testId="calmon-filter-result" /></div>
        <div className="w-60"><SearchableSelect options={[{ value: "", label: "All Statuses" },
            ...["Due", "Passed", "Failed", "Recalibration Required", "Overdue"].map((s) => ({ value: s, label: s }))]}
          value={filters.status} onChange={(v) => setFilters({ ...filters, status: v })} placeholder="Status" testId="calmon-filter-status" /></div>
      </div>

      <DataTable columns={columns} rows={rows} testId="calibration-monitoring-table" emptyText="No calibration records yet." />

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="bg-bone" data-testid="assign-recal-dialog">
          <DialogHeader><DialogTitle>Assign Recalibration &mdash; {selected?.cal_id}</DialogTitle></DialogHeader>
          <p className="text-sm text-ink/70">{selected?.machine_label} &middot; {selected?.slot_id} &middot; {selected?.bin_id} &middot; variance {selected?.variance_pct}%</p>
          <SearchableSelect options={[{ value: "", label: "Auto-assign lowest workload" },
                                       ...technicians.map((t) => ({ value: t.username, label: `${t.name} (${t.username}) \u00b7 ${t.active_work_orders} active` }))]}
                             value={form.technician} onChange={(v) => setForm({ ...form, technician: v })} testId="recal-technician-select" />
          <SearchableSelect options={(meta?.priorities || []).map((p) => ({ value: p, label: p }))} value={form.priority}
                             onChange={(v) => setForm({ ...form, priority: v })} testId="recal-priority-select" />
          <Textarea placeholder="Comment" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })}
                     className="bg-bone" data-testid="recal-comment-input" />
          <Button onClick={assign} data-testid="recal-submit-btn" className="bg-beet hover:bg-beet-hover text-bone">Create Recalibration Work Order</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
