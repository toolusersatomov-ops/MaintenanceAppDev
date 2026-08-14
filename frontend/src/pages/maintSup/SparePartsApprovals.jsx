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

export default function SparePartsApprovals() {
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState([]);
  const [dialog, setDialog] = useState(null); // {req, decision}
  const [comment, setComment] = useState("");
  const { toast } = useToast();

  const load = useCallback(() => {
    api.get(`/maintenance-sup/spare-parts-requests${status ? `?status=${status}` : ""}`).then(({ data }) => setRows(data));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const decide = async () => {
    try {
      const { data } = await api.post(`/maintenance-sup/spare-parts-requests/${dialog.req.id}/decision`,
                                       { decision: dialog.decision, comment: comment || null });
      toast({ title: data.message });
      setDialog(null); setComment(""); load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const columns = [
    { key: "req_id", label: "Request ID", mono: true },
    { key: "technician", label: "Technician" },
    { key: "part_name", label: "Part" },
    { key: "part_code", label: "Part Code", mono: true },
    { key: "quantity", label: "Qty" },
    { key: "machine_label", label: "Machine" },
    { key: "work_order_ref", label: "Work Order", mono: true },
    { key: "reason", label: "Reason" },
    { key: "priority", label: "Priority", render: (r) => <StatusBadge status={r.priority} /> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "requested_at", label: "Requested", render: (r) => fmt(r.requested_at) },
    { key: "supervisor_comment", label: "Supervisor Comment" },
    { key: "actions", label: "", render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.status === "Requested" && (
            <>
              <Button size="sm" onClick={() => setDialog({ req: r, decision: "approve" })} data-testid={`approve-req-${r.req_id}`} className="bg-beet hover:bg-beet-hover text-bone">Approve</Button>
              <Button size="sm" variant="outline" onClick={() => setDialog({ req: r, decision: "reject" })} data-testid={`reject-req-${r.req_id}`} className="border-red-300 text-red-700">Reject</Button>
            </>
          )}
          {r.status === "Approved" && (
            <Button size="sm" onClick={() => setDialog({ req: r, decision: "issue" })} data-testid={`issue-req-${r.req_id}`} className="bg-beet hover:bg-beet-hover text-bone">Issue Part</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setDialog({ req: r, decision: "comment" })} data-testid={`comment-req-${r.req_id}`}>Comment</Button>
        </div>
      ) },
  ];

  return (
    <div data-testid="spare-parts-approvals-page">
      <PageHeader title="Spare Parts Approvals" description="Approve, reject and issue technician spare part requests" />
      <div className="w-56 mb-4">
        <SearchableSelect options={[{ value: "", label: "All Requests" },
          ...["Requested", "Approved", "Rejected", "Issued", "Received", "Used"].map((s) => ({ value: s, label: s }))]}
          value={status} onChange={setStatus} placeholder="Status" testId="approvals-filter-status" />
      </div>
      <DataTable columns={columns} rows={rows} testId="spare-parts-approvals-table" emptyText="No spare part requests." />

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="bg-bone" data-testid="approval-dialog">
          <DialogHeader><DialogTitle>{dialog?.decision === "issue" ? "Issue Part" : dialog?.decision === "reject" ? "Reject Request" : dialog?.decision === "approve" ? "Approve Request" : "Add Comment"} &mdash; {dialog?.req?.req_id}</DialogTitle></DialogHeader>
          <p className="text-sm text-ink/70">{dialog?.req?.quantity}x {dialog?.req?.part_name} for {dialog?.req?.machine_label} ({dialog?.req?.technician})</p>
          <Textarea placeholder="Comment" value={comment} onChange={(e) => setComment(e.target.value)} className="bg-bone" data-testid="approval-comment-input" />
          <Button onClick={dialog?.decision === "comment" ? () => { setDialog(null); setComment(""); } : decide}
                   data-testid="approval-submit-btn" className="bg-beet hover:bg-beet-hover text-bone">Confirm</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
