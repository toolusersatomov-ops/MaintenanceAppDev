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
import Timeline from "@/components/shared/Timeline";
import InfoGrid from "@/components/maint/InfoGrid";
import WorkOrderRows from "@/components/maint/WorkOrderRows";
import { useMeta, useMachines, machineOptions, fmt } from "@/components/maint/useMaint";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

const EMPTY_WO = { machine_id: "", work_type: "Breakdown", issue_type: "", component: "", priority: "Medium",
                   technician: "", due_at: "", description: "", supervisor_comment: "" };

export default function MSWorkOrders() {
  const meta = useMeta();
  const { machines } = useMachines();
  const [params] = useSearchParams();
  const [filters, setFilters] = useState({
    status: params.get("status") || "", machine_id: params.get("machine_id") || "", technician: "",
    active: params.get("active") === "1",
  });
  const [orders, setOrders] = useState([]);
  const [detail, setDetail] = useState(null);
  const [technicians, setTechnicians] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_WO);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState({ decision: "approve", comment: "" });
  const [assignTech, setAssignTech] = useState("");
  const [comment, setComment] = useState("");
  const { toast } = useToast();

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (filters.status) q.set("status", filters.status);
    if (filters.machine_id) q.set("machine_id", filters.machine_id);
    if (filters.technician) q.set("technician", filters.technician);
    if (filters.active) q.set("active", "true");
    const { data } = await api.get(`/maintenance/work-orders?${q.toString()}`);
    setOrders(data);
  }, [filters]);

  const loadDetail = useCallback(async (id) => {
    const { data } = await api.get(`/maintenance/work-orders/${id}`);
    setDetail(data);
    setAssignTech(data.work_order.assigned_technician || "");
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/maintenance/technicians").then(({ data }) => setTechnicians(data)); }, []);

  const wo = detail?.work_order;

  const post = async (path, body, successKey = "message") => {
    try {
      const { data } = await api.post(path, body);
      toast({ title: data[successKey] || "Saved" });
      await load();
      if (wo) await loadDetail(wo.id);
      return true;
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
      return false;
    }
  };

  const createWO = async () => {
    const ok = await post("/maintenance-sup/work-orders", {
      ...form, technician: form.technician || null,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
    });
    if (ok) { setCreateOpen(false); setForm(EMPTY_WO); }
  };

  const submitReview = async () => {
    const ok = await post(`/maintenance-sup/work-orders/${wo.id}/review`, review);
    if (ok) { setReviewOpen(false); setReview({ decision: "approve", comment: "" }); }
  };

  return (
    <div data-testid="ms-work-orders-page">
      <PageHeader title="Work Orders" description="Create, assign, monitor and review all maintenance work orders"
        actions={<Button onClick={() => setCreateOpen(true)} data-testid="create-work-order-btn" className="bg-beet hover:bg-beet-hover text-bone">New Work Order</Button>} />

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="w-56"><SearchableSelect options={[{ value: "", label: "All Statuses" }, ...(meta?.wo_statuses || []).map((s) => ({ value: s, label: s }))]}
          value={filters.status} onChange={(v) => setFilters({ ...filters, status: v, active: false })} placeholder="Status" testId="ms-wo-filter-status" /></div>
        <div className="w-56"><SearchableSelect options={[{ value: "", label: "All Machines" }, ...machineOptions(machines)]}
          value={filters.machine_id} onChange={(v) => setFilters({ ...filters, machine_id: v })} placeholder="Machine" testId="ms-wo-filter-machine" /></div>
        <div className="w-56"><SearchableSelect options={[{ value: "", label: "All Technicians" }, ...technicians.map((t) => ({ value: t.username, label: `${t.name} (${t.username})` }))]}
          value={filters.technician} onChange={(v) => setFilters({ ...filters, technician: v })} placeholder="Technician" testId="ms-wo-filter-technician" /></div>
        <span className="text-sm text-ink/60 self-center" data-testid="ms-wo-count">{orders.length} work order(s)</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <WorkOrderRows orders={orders} selectedId={wo?.id} onSelect={(o) => loadDetail(o.id)} />

        {wo && (
          <Card className="bg-oat border-clay/40 h-fit" data-testid="ms-wo-detail-panel">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-display text-lg font-bold text-ink">{wo.wo_id} &middot; {wo.issue_type}</h2>
                <StatusBadge status={wo.status} testId="ms-wo-detail-status" />
              </div>
              <InfoGrid items={[
                ["Machine", wo.machine_label], ["Work Type", wo.work_type], ["Component", wo.component],
                ["Error Code", wo.error_code], ["Priority", <StatusBadge status={wo.priority} />],
                ["Technician", wo.assigned_technician || "Unassigned"], ["Current Stage", wo.status],
                ["Created", fmt(wo.created_at)], ["Due", fmt(wo.due_at)], ["Last Updated", fmt(wo.updated_at)],
                ["Flag Status", wo.flagged ? `${wo.flag?.reason}: ${wo.flag?.comment}` : "No flags"],
                ["Supervisor Comment", wo.supervisor_comment], ["Technician Comment", wo.technician_comment],
                ["Description", wo.description],
              ]} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-stone">
                <div>
                  <label className="text-xs uppercase text-ink/60">Assign / Reassign Technician</label>
                  <SearchableSelect options={[{ value: "", label: "Auto-assign lowest workload" },
                                               ...technicians.map((t) => ({ value: t.username, label: `${t.name} (${t.username}) \u00b7 ${t.active_work_orders} active` }))]}
                                     value={assignTech} onChange={setAssignTech} testId="ms-wo-assign-select" />
                  <Button size="sm" className="mt-2 bg-beet hover:bg-beet-hover text-bone" data-testid="ms-wo-assign-btn"
                           onClick={() => post(`/maintenance-sup/work-orders/${wo.id}/assign`, { technician: assignTech || null })}>Assign</Button>
                </div>
                <div>
                  <label className="text-xs uppercase text-ink/60">Change Priority</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(meta?.priorities || []).map((p) => (
                      <Button key={p} size="sm" variant={wo.priority === p ? "default" : "outline"} data-testid={`ms-wo-priority-${p.toLowerCase()}`}
                               onClick={() => post(`/maintenance-sup/work-orders/${wo.id}/priority`, { priority: p })}>{p}</Button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs uppercase text-ink/60">Change Due Date/Time</label>
                  <Input type="datetime-local" className="bg-bone" data-testid="ms-wo-due-input"
                          onChange={(e) => e.target.value && post(`/maintenance-sup/work-orders/${wo.id}/due`, { due_at: new Date(e.target.value).toISOString() })} />
                </div>
                <div>
                  <label className="text-xs uppercase text-ink/60">Supervisor Comment</label>
                  <Textarea value={comment} onChange={(e) => setComment(e.target.value)} className="bg-bone" data-testid="ms-wo-comment-input" />
                  <Button size="sm" variant="outline" className="mt-2" data-testid="ms-wo-comment-btn" disabled={!comment.trim()}
                           onClick={async () => { await post(`/maintenance-sup/work-orders/${wo.id}/comment`, { comment }); setComment(""); }}>Add Comment</Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {wo.status === "Pending Supervisor Review" && (
                  <Button onClick={() => setReviewOpen(true)} data-testid="ms-wo-review-btn" className="bg-beet hover:bg-beet-hover text-bone">Review Submission</Button>
                )}
                <Button variant="outline" data-testid="ms-wo-escalate-btn"
                         onClick={() => post(`/maintenance-sup/work-orders/${wo.id}/escalate`, { reason: "Repair Overdue", priority: wo.priority, comment: "Escalated from work order" })}>Escalate</Button>
              </div>

              {detail && (
                <div className="text-xs text-ink/80 space-y-1 pt-2 border-t border-stone" data-testid="ms-wo-evidence">
                  <p className="font-semibold text-ink">Evidence for review</p>
                  <p>Diagnostics: {detail.diagnostics.length} &middot; Component tests: {detail.component_tests.length} &middot; Calibrations: {detail.calibrations.length} &middot; Parts used: {detail.parts_used.length}</p>
                  {detail.diagnostics[0] && <p>Latest diagnostic result: <StatusBadge status={detail.diagnostics[0].overall_result} /></p>}
                  {wo.repair && (
                    <div className="space-y-0.5">
                      <p>Diagnosis: {wo.repair.diagnosis_summary}</p>
                      <p>Root cause: {wo.repair.root_cause}</p>
                      <p>Repair: {wo.repair.repair_action}</p>
                      <p>Testing: {wo.repair.testing_result}</p>
                      <p>Photos: {wo.repair.before_photo ? "before \u2713" : "before \u2717"} {wo.repair.after_photo ? "after \u2713" : "after \u2717"}</p>
                    </div>
                  )}
                  {detail.calibrations.map((c) => (
                    <p key={c.id}>{c.cal_id}: {c.calibration_type} &rarr; {c.result} ({c.variance_pct}%)</p>
                  ))}
                  {detail.parts_used.map((p) => (
                    <p key={p.id}>{p.part_name} x{p.quantity} ({p.part_code})</p>
                  ))}
                </div>
              )}

              <div>
                <h3 className="font-display font-semibold text-ink mb-3">Timeline</h3>
                <Timeline history={wo.history || []} testId="ms-wo-timeline" />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-bone max-h-[85vh] overflow-y-auto" data-testid="create-wo-dialog">
          <DialogHeader><DialogTitle>New Work Order</DialogTitle></DialogHeader>
          <SearchableSelect options={machineOptions(machines)} value={form.machine_id} onChange={(v) => setForm({ ...form, machine_id: v })}
                             placeholder="Select Machine" testId="new-wo-machine-select" />
          <SearchableSelect options={(meta?.work_types || []).map((w) => ({ value: w, label: w }))} value={form.work_type}
                             onChange={(v) => setForm({ ...form, work_type: v })} testId="new-wo-type-select" />
          <SearchableSelect options={(meta?.alert_types || []).map((t) => ({ value: t, label: t }))} value={form.issue_type}
                             onChange={(v) => setForm({ ...form, issue_type: v, component: meta?.alert_master?.[v]?.component || "" })}
                             placeholder="Issue Type" testId="new-wo-issue-select" />
          <SearchableSelect options={(meta?.component_categories || []).map((c) => ({ value: c, label: c }))} value={form.component}
                             onChange={(v) => setForm({ ...form, component: v })} placeholder="Component" testId="new-wo-component-select" />
          <SearchableSelect options={(meta?.priorities || []).map((p) => ({ value: p, label: p }))} value={form.priority}
                             onChange={(v) => setForm({ ...form, priority: v })} testId="new-wo-priority-select" />
          <SearchableSelect options={[{ value: "", label: "Auto-assign lowest workload" },
                                       ...technicians.map((t) => ({ value: t.username, label: `${t.name} (${t.username}) \u00b7 ${t.active_work_orders} active \u00b7 ${t.availability}` }))]}
                             value={form.technician} onChange={(v) => setForm({ ...form, technician: v })} testId="new-wo-technician-select" />
          <div>
            <label className="text-xs uppercase text-ink/60">Due Date/Time</label>
            <Input type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })}
                    className="bg-bone" data-testid="new-wo-due-input" />
          </div>
          <Textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                     className="bg-bone" data-testid="new-wo-description-input" />
          <Textarea placeholder="Supervisor Comment" value={form.supervisor_comment} onChange={(e) => setForm({ ...form, supervisor_comment: e.target.value })}
                     className="bg-bone" data-testid="new-wo-comment-input" />
          <Button onClick={createWO} disabled={!form.machine_id || !form.issue_type} data-testid="new-wo-submit-btn"
                   className="bg-beet hover:bg-beet-hover text-bone">Create Work Order</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="bg-bone" data-testid="review-dialog">
          <DialogHeader><DialogTitle>Supervisor Review &mdash; {wo?.wo_id}</DialogTitle></DialogHeader>
          <SearchableSelect options={[{ value: "approve", label: "Approve and Close" }, { value: "return", label: "Return to Technician" },
                                       { value: "reopen", label: "Reopen Repair" }]}
                             value={review.decision} onChange={(v) => setReview({ ...review, decision: v })} testId="review-decision-select" />
          <Textarea placeholder="Supervisor comment" value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })}
                     className="bg-bone" data-testid="review-comment-input" />
          <Button onClick={submitReview} data-testid="review-submit-btn" className="bg-beet hover:bg-beet-hover text-bone">Submit Review</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
