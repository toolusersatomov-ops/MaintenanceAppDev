import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import DataTable from "@/components/shared/DataTable";
import { useMeta, useMachines, machineOptions, fmt } from "@/components/maint/useMaint";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

const EMPTY = { machine_id: "", pm_type: "Routine PM", frequency: "Quarterly", scheduled_at: "", due_at: "",
                technician: "", priority: "Medium", checklist_template: "Standard 31-Point PM Checklist", comment: "" };

export default function PMPlanner() {
  const meta = useMeta();
  const { machines } = useMachines();
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get("status") || "");
  const [rows, setRows] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const { toast } = useToast();

  const load = useCallback(() => {
    api.get(`/maintenance-sup/pm${status ? `?status=${status}` : ""}`).then(({ data }) => setRows(data));
  }, [status]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/maintenance/technicians").then(({ data }) => setTechnicians(data)); }, []);

  const create = async () => {
    try {
      const { data } = await api.post("/maintenance-sup/pm", {
        ...form, technician: form.technician || null,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      });
      toast({ title: data.message });
      setOpen(false); setForm(EMPTY); load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const columns = [
    { key: "pm_id", label: "PM ID", mono: true },
    { key: "machine_label", label: "Machine" },
    { key: "pm_type", label: "PM Type" },
    { key: "frequency", label: "Frequency" },
    { key: "scheduled_at", label: "Scheduled", render: (r) => fmt(r.scheduled_at) },
    { key: "due_at", label: "Due", render: (r) => fmt(r.due_at) },
    { key: "technician", label: "Technician" },
    { key: "priority", label: "Priority", render: (r) => <StatusBadge status={r.priority} /> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "progress", label: "Checklist", render: (r) => `${(r.steps || []).filter((s) => s.status !== "Not Started").length} / ${(r.steps || []).length}` },
    { key: "work_order_ref", label: "Work Order", mono: true },
    { key: "last_completed_at", label: "Last Completed", render: (r) => fmt(r.last_completed_at) },
  ];

  return (
    <div data-testid="pm-planner-page">
      <PageHeader title="Preventive Maintenance Planner" description="Schedule PM visits; each schedule creates a technician work order automatically"
        actions={<Button onClick={() => setOpen(true)} data-testid="schedule-pm-btn" className="bg-beet hover:bg-beet-hover text-bone">Schedule PM</Button>} />

      <div className="w-56 mb-4">
        <SearchableSelect options={[{ value: "", label: "All Statuses" }, ...["Scheduled", "Due", "Overdue", "In Progress", "Completed"].map((s) => ({ value: s, label: s }))]}
                           value={status} onChange={setStatus} placeholder="Status" testId="pm-filter-status" />
      </div>

      <DataTable columns={columns} rows={rows} testId="pm-planner-table" emptyText="No preventive maintenance schedules." />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-bone max-h-[85vh] overflow-y-auto" data-testid="schedule-pm-dialog">
          <DialogHeader><DialogTitle>Schedule Preventive Maintenance</DialogTitle></DialogHeader>
          <SearchableSelect options={machineOptions(machines)} value={form.machine_id} onChange={(v) => setForm({ ...form, machine_id: v })}
                             placeholder="Select Machine" testId="pm-machine-select" />
          <SearchableSelect options={(meta?.pm_types || []).map((t) => ({ value: t, label: t }))} value={form.pm_type}
                             onChange={(v) => setForm({ ...form, pm_type: v })} testId="pm-type-select" />
          <SearchableSelect options={(meta?.pm_frequencies || []).map((f) => ({ value: f, label: f }))} value={form.frequency}
                             onChange={(v) => setForm({ ...form, frequency: v })} testId="pm-frequency-select" />
          <div>
            <label className="text-xs uppercase text-ink/60">Scheduled Date/Time</label>
            <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                    className="bg-bone" data-testid="pm-scheduled-input" />
          </div>
          <div>
            <label className="text-xs uppercase text-ink/60">Due Date</label>
            <Input type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })}
                    className="bg-bone" data-testid="pm-due-input" />
          </div>
          <SearchableSelect options={[{ value: "", label: "Auto-assign lowest workload" },
                                       ...technicians.map((t) => ({ value: t.username, label: `${t.name} (${t.username}) \u00b7 ${t.active_work_orders} active` }))]}
                             value={form.technician} onChange={(v) => setForm({ ...form, technician: v })} testId="pm-technician-select" />
          <SearchableSelect options={(meta?.priorities || []).map((p) => ({ value: p, label: p }))} value={form.priority}
                             onChange={(v) => setForm({ ...form, priority: v })} testId="pm-priority-select" />
          <Input value={form.checklist_template} onChange={(e) => setForm({ ...form, checklist_template: e.target.value })}
                  className="bg-bone" data-testid="pm-template-input" />
          <Textarea placeholder="Comment" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })}
                     className="bg-bone" data-testid="pm-comment-input" />
          <Button onClick={create} disabled={!form.machine_id} data-testid="pm-submit-btn" className="bg-beet hover:bg-beet-hover text-bone">Create PM Schedule</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
