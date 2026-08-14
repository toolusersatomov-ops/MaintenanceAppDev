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
import InfoGrid from "@/components/maint/InfoGrid";
import { useMeta, useMachines, machineOptions, fmt } from "@/components/maint/useMaint";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function TechnicalAlerts() {
  const meta = useMeta();
  const { machines } = useMachines();
  const [params] = useSearchParams();
  const [filters, setFilters] = useState({
    machine_id: params.get("machine_id") || "", severity: params.get("severity") || "",
    alert_type: params.get("alert_type") || "", status: params.get("status") || "Open",
  });
  const [alerts, setAlerts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [technicians, setTechnicians] = useState([]);
  const [woOpen, setWoOpen] = useState(false);
  const [woForm, setWoForm] = useState({ work_type: "Breakdown", priority: "", technician: "", due_at: "", supervisor_comment: "" });
  const [escOpen, setEscOpen] = useState(false);
  const [esc, setEsc] = useState({ reason: "", priority: "High", comment: "" });
  const [ackOpen, setAckOpen] = useState(false);
  const [ackNote, setAckNote] = useState("");
  const { toast } = useToast();

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && q.set(k, v));
    const { data } = await api.get(`/maintenance-sup/technical-alerts?${q.toString()}`);
    setAlerts(data);
    if (selected) setSelected(data.find((a) => a.id === selected.id) || null);
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/maintenance/technicians").then(({ data }) => setTechnicians(data)); }, []);

  const createWO = async () => {
    try {
      const { data } = await api.post(`/maintenance-sup/technical-alerts/${selected.id}/create-work-order`, {
        work_type: woForm.work_type, priority: woForm.priority || null, technician: woForm.technician || null,
        due_at: woForm.due_at ? new Date(woForm.due_at).toISOString() : null,
        supervisor_comment: woForm.supervisor_comment || null,
      });
      toast({ title: data.message });
      setWoOpen(false);
      setWoForm({ work_type: "Breakdown", priority: "", technician: "", due_at: "", supervisor_comment: "" });
      load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const emailStaff = async () => {
    const { data } = await api.post(`/maintenance-sup/technical-alerts/${selected.id}/email-staff`, {});
    toast({ title: data.message });
  };

  const escalate = async () => {
    try {
      const { data } = await api.post(`/maintenance-sup/technical-alerts/${selected.id}/escalate`, esc);
      toast({ title: data.message });
      setEscOpen(false); setEsc({ reason: "", priority: "High", comment: "" }); load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const acknowledge = async () => {
    try {
      const { data } = await api.post(`/maintenance-sup/technical-alerts/${selected.id}/acknowledge`, { resolution_note: ackNote || null });
      toast({ title: data.message });
      setAckOpen(false); setAckNote(""); load();
    } catch (e) {
      toast({ title: "Cannot close alert", description: formatApiError(e), variant: "destructive" });
    }
  };

  const a = selected;

  return (
    <div data-testid="technical-alerts-page">
      <PageHeader title="Technical Alerts" description="Machine faults reported by telemetry, calibration failures and PM triggers" />

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="w-56"><SearchableSelect options={[{ value: "", label: "All Machines" }, ...machineOptions(machines)]}
          value={filters.machine_id} onChange={(v) => setFilters({ ...filters, machine_id: v })} placeholder="Machine" testId="alerts-filter-machine" /></div>
        <div className="w-44"><SearchableSelect options={[{ value: "", label: "All Severities" }, ...(meta?.severities || []).map((s) => ({ value: s, label: s }))]}
          value={filters.severity} onChange={(v) => setFilters({ ...filters, severity: v })} placeholder="Severity" testId="alerts-filter-severity" /></div>
        <div className="w-64"><SearchableSelect options={[{ value: "", label: "All Alert Types" }, ...(meta?.alert_types || []).map((s) => ({ value: s, label: s }))]}
          value={filters.alert_type} onChange={(v) => setFilters({ ...filters, alert_type: v })} placeholder="Alert type" testId="alerts-filter-type" /></div>
        <div className="w-48"><SearchableSelect options={[{ value: "", label: "All Statuses" }, { value: "Open", label: "Open / Active" },
            { value: "Work Order Created", label: "Work Order Created" }, { value: "Acknowledged", label: "Acknowledged" },
            { value: "Escalated", label: "Escalated" }, { value: "Resolved", label: "Resolved" }]}
          value={filters.status} onChange={(v) => setFilters({ ...filters, status: v })} placeholder="Status" testId="alerts-filter-status" /></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="space-y-2">
          {alerts.length === 0 && <p className="text-sm text-ink/60" data-testid="alerts-empty">No technical alerts match these filters.</p>}
          {alerts.map((al) => (
            <Card key={al.id} onClick={() => setSelected(al)} data-testid={`technical-alert-${al.alert_id}`}
                   className={`bg-oat border-clay/40 cursor-pointer hover:border-beet/60 ${a?.id === al.id ? "border-beet ring-1 ring-beet/40" : ""}`}>
              <CardContent className="p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink"><span className="font-mono text-beet">{al.alert_id}</span> {al.alert_type}</p>
                  <p className="text-xs text-ink/60 font-mono">{al.machine_label} &middot; {al.component} &middot; {al.error_code} &middot; {fmt(al.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={al.severity} />
                  <StatusBadge status={al.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {a && (
          <Card className="bg-oat border-clay/40 h-fit" data-testid="alert-detail-panel">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-display text-lg font-bold text-ink">{a.alert_id} &middot; {a.alert_type}</h2>
                <StatusBadge status={a.status} />
              </div>
              <InfoGrid items={[
                ["Alert ID", a.alert_id], ["Machine", a.machine_label], ["Component", a.component],
                ["Error Code", a.error_code], ["Severity", <StatusBadge status={a.severity} />],
                ["Created Time", fmt(a.created_at)], ["Current Status", a.status],
                ["Work Order", a.work_order_ref || "Not created"], ["Detail", a.detail],
                ["Suggested Action", a.suggested_action],
              ]} />
              <div className="flex flex-wrap gap-2 pt-2 border-t border-stone">
                <Button onClick={() => setWoOpen(true)} disabled={!!a.work_order_id} data-testid="alert-create-wo-btn"
                         className="bg-beet hover:bg-beet-hover text-bone">Create Work Order</Button>
                <Button variant="outline" onClick={emailStaff} data-testid="alert-email-staff-btn">Email Staff</Button>
                <Button variant="outline" onClick={() => setEscOpen(true)} data-testid="alert-escalate-btn">Escalate</Button>
                <Button variant="outline" onClick={() => setAckOpen(true)} data-testid="alert-acknowledge-btn">Acknowledge / Close</Button>
              </div>
              {(a.severity === "Critical" || a.alert_type === "Machine Down") && !a.work_order_id && (
                <p className="text-xs text-red-700" data-testid="alert-critical-warning">
                  Critical / Machine Down alerts cannot be closed without a work order or a documented resolution.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={woOpen} onOpenChange={setWoOpen}>
        <DialogContent className="bg-bone" data-testid="alert-create-wo-dialog">
          <DialogHeader><DialogTitle>Create Work Order &mdash; {a?.alert_type}</DialogTitle></DialogHeader>
          <SearchableSelect options={(meta?.work_types || []).map((w) => ({ value: w, label: w }))} value={woForm.work_type}
                             onChange={(v) => setWoForm({ ...woForm, work_type: v })} testId="wo-work-type-select" />
          <SearchableSelect options={[{ value: "", label: "Priority from severity" }, ...(meta?.priorities || []).map((p) => ({ value: p, label: p }))]}
                             value={woForm.priority} onChange={(v) => setWoForm({ ...woForm, priority: v })} testId="wo-priority-select" />
          <SearchableSelect options={[{ value: "", label: "Auto-assign lowest workload" },
                                       ...technicians.map((t) => ({ value: t.username, label: `${t.name} (${t.username}) \u00b7 ${t.active_work_orders} active \u00b7 ${t.availability}` }))]}
                             value={woForm.technician} onChange={(v) => setWoForm({ ...woForm, technician: v })} testId="wo-technician-select" />
          <div>
            <label className="text-xs uppercase text-ink/60">Due Date/Time</label>
            <Input type="datetime-local" value={woForm.due_at} onChange={(e) => setWoForm({ ...woForm, due_at: e.target.value })}
                    className="bg-bone" data-testid="wo-due-input" />
          </div>
          <Textarea placeholder="Supervisor comment (optional)" value={woForm.supervisor_comment}
                     onChange={(e) => setWoForm({ ...woForm, supervisor_comment: e.target.value })} className="bg-bone" data-testid="wo-comment-input" />
          <Button onClick={createWO} data-testid="wo-create-submit-btn" className="bg-beet hover:bg-beet-hover text-bone">Create Work Order</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={escOpen} onOpenChange={setEscOpen}>
        <DialogContent className="bg-bone" data-testid="alert-escalate-dialog">
          <DialogHeader><DialogTitle>Escalate Alert</DialogTitle></DialogHeader>
          <SearchableSelect options={(meta?.escalation_reasons || []).map((r) => ({ value: r, label: r }))} value={esc.reason}
                             onChange={(v) => setEsc({ ...esc, reason: v })} placeholder="Reason" testId="escalate-reason-select" />
          <SearchableSelect options={(meta?.priorities || []).map((p) => ({ value: p, label: p }))} value={esc.priority}
                             onChange={(v) => setEsc({ ...esc, priority: v })} testId="escalate-priority-select" />
          <Textarea placeholder="Comment" value={esc.comment} onChange={(e) => setEsc({ ...esc, comment: e.target.value })}
                     className="bg-bone" data-testid="escalate-comment-input" />
          <Button onClick={escalate} disabled={!esc.reason} data-testid="escalate-submit-btn" className="bg-beet hover:bg-beet-hover text-bone">Raise Escalation</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={ackOpen} onOpenChange={setAckOpen}>
        <DialogContent className="bg-bone" data-testid="alert-ack-dialog">
          <DialogHeader><DialogTitle>Acknowledge / Close Alert</DialogTitle></DialogHeader>
          <Textarea placeholder="Documented resolution (required to close critical alerts without a work order)"
                     value={ackNote} onChange={(e) => setAckNote(e.target.value)} className="bg-bone" data-testid="ack-note-input" />
          <Button onClick={acknowledge} data-testid="ack-submit-btn" className="bg-beet hover:bg-beet-hover text-bone">Save</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
