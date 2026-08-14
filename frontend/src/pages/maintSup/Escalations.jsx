import React, { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import DataTable from "@/components/shared/DataTable";
import { fmt } from "@/components/maint/useMaint";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function Escalations() {
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [dialog, setDialog] = useState(null); // {esc, action}
  const [comment, setComment] = useState("");
  const [tech, setTech] = useState("");
  const { toast } = useToast();

  const load = useCallback(() => {
    api.get(`/maintenance-sup/escalations${status ? `?status=${status}` : ""}`).then(({ data }) => setRows(data));
  }, [status]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/maintenance/technicians").then(({ data }) => setTechnicians(data)); }, []);

  const submit = async () => {
    const { esc, action } = dialog;
    try {
      let res;
      if (action === "assign") res = await api.post(`/maintenance-sup/escalations/${esc.id}/assign`, { technician: tech || null });
      else if (action === "resolve") res = await api.post(`/maintenance-sup/escalations/${esc.id}/resolve`, { comment });
      else if (action === "email") res = await api.post(`/maintenance-sup/escalations/${esc.id}/email-staff`, { note: comment });
      else res = await api.post(`/maintenance-sup/escalations/${esc.id}/comment`, { comment });
      toast({ title: res.data.message });
      setDialog(null); setComment(""); setTech(""); load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const columns = [
    { key: "esc_id", label: "Escalation ID", mono: true },
    { key: "work_order_ref", label: "Work Order", mono: true },
    { key: "machine_label", label: "Machine" },
    { key: "issue", label: "Issue" },
    { key: "technician", label: "Technician" },
    { key: "reason", label: "Reason" },
    { key: "priority", label: "Priority", render: (r) => <StatusBadge status={r.priority} /> },
    { key: "created_at", label: "Raised", render: (r) => fmt(r.created_at) },
    { key: "age_hours", label: "Age (hrs)" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "actions", label: "", render: (r) => (
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={() => setDialog({ esc: r, action: "assign" })} data-testid={`esc-assign-${r.esc_id}`}>Assign</Button>
          <Button size="sm" variant="ghost" onClick={() => setDialog({ esc: r, action: "comment" })} data-testid={`esc-comment-${r.esc_id}`}>Comment</Button>
          <Button size="sm" variant="ghost" onClick={() => setDialog({ esc: r, action: "email" })} data-testid={`esc-email-${r.esc_id}`}>Email Staff</Button>
          {r.status !== "Resolved" && (
            <Button size="sm" onClick={() => setDialog({ esc: r, action: "resolve" })} data-testid={`esc-resolve-${r.esc_id}`} className="bg-beet hover:bg-beet-hover text-bone">Resolve</Button>
          )}
        </div>
      ) },
  ];

  return (
    <div data-testid="escalations-page">
      <PageHeader title="Escalations" description="Technician flags and supervisor escalations that need intervention" />
      <div className="w-56 mb-4">
        <SearchableSelect options={[{ value: "", label: "All Escalations" }, { value: "Open", label: "Open" },
          { value: "Assigned", label: "Assigned" }, { value: "Resolved", label: "Resolved" }]}
          value={status} onChange={setStatus} placeholder="Status" testId="escalations-filter-status" />
      </div>
      <DataTable columns={columns} rows={rows} testId="escalations-table" emptyText="No escalations raised." />

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="bg-bone" data-testid="escalation-dialog">
          <DialogHeader><DialogTitle>{dialog?.action === "assign" ? "Assign Escalation" : dialog?.action === "resolve" ? "Resolve Escalation" : dialog?.action === "email" ? "Email Staff" : "Add Comment"} &mdash; {dialog?.esc?.esc_id}</DialogTitle></DialogHeader>
          <p className="text-sm text-ink/70">{dialog?.esc?.machine_label} &middot; {dialog?.esc?.reason} &middot; {dialog?.esc?.comment}</p>
          {dialog?.action === "assign" && (
            <SearchableSelect options={[{ value: "", label: "Auto-assign lowest workload" },
                                         ...technicians.map((t) => ({ value: t.username, label: `${t.name} (${t.username}) \u00b7 ${t.active_work_orders} active` }))]}
                               value={tech} onChange={setTech} testId="escalation-technician-select" />
          )}
          {dialog?.action !== "assign" && (
            <Textarea placeholder="Comment" value={comment} onChange={(e) => setComment(e.target.value)} className="bg-bone" data-testid="escalation-comment-input" />
          )}
          <Button onClick={submit} data-testid="escalation-submit-btn" className="bg-beet hover:bg-beet-hover text-bone">Confirm</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
