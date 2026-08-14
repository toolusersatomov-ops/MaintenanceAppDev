import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import SearchableSelect from "@/components/shared/SearchableSelect";
import QRScanSim from "@/components/shared/QRScanSim";
import Timeline from "@/components/shared/Timeline";
import InfoGrid from "@/components/maint/InfoGrid";
import WorkOrderRows from "@/components/maint/WorkOrderRows";
import { useMeta, fmt } from "@/components/maint/useMaint";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

const ACTION_MAP = {
  Assigned: ["Accept"],
  Accepted: ["Start Travel"],
  "In Transit": ["Reached Machine"],
  "Reached Machine": ["Start Diagnosis"],
  "Diagnosis Started": ["Complete Diagnosis"],
  "Diagnosis Completed": ["Start Repair"],
  "Repair In Progress": ["Start Testing"],
  "Waiting for Parts": ["Start Repair"],
  Testing: ["Submit for Supervisor Review"],
};

export default function TechWorkOrders() {
  const meta = useMeta();
  const [params] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [statusFilter, setStatusFilter] = useState(params.get("status") || "");
  const [flagOpen, setFlagOpen] = useState(false);
  const [flag, setFlag] = useState({ reason: "", comment: "" });
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [partOpen, setPartOpen] = useState(false);
  const [partForm, setPartForm] = useState({ part_code: "", quantity: 1, reason: "", priority: "Medium", comment: "" });
  const [parts, setParts] = useState([]);
  const { toast } = useToast();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
    const { data } = await api.get(`/maintenance/work-orders${query}`);
    setOrders(data);
    return data;
  }, [statusFilter]);

  const loadDetail = useCallback(async (id) => {
    const { data } = await api.get(`/maintenance/work-orders/${id}`);
    setDetail(data);
    setSelected(data.work_order);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/maintenance/my-parts").then(({ data }) => setParts(data));
  }, []);

  const act = async (action) => {
    try {
      await api.post(`/maintenance/work-orders/${selected.id}/action`, { action });
      toast({ title: `${action} recorded` });
      await load();
      await loadDetail(selected.id);
    } catch (e) {
      toast({ title: "Action failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const verifyQR = async (qr) => {
    try {
      const { data } = await api.post(`/maintenance/work-orders/${selected.id}/verify-qr`, { qr_code_id: qr });
      toast({ title: data.message });
      await loadDetail(selected.id);
    } catch (e) {
      toast({ title: "Verification failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const submitFlag = async () => {
    try {
      const { data } = await api.post(`/maintenance/work-orders/${selected.id}/flag`, flag);
      toast({ title: data.message });
      setFlagOpen(false); setFlag({ reason: "", comment: "" });
      await load(); await loadDetail(selected.id);
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const submitComment = async () => {
    await api.post(`/maintenance/work-orders/${selected.id}/comment`, { comment });
    toast({ title: "Comment added" });
    setCommentOpen(false); setComment(""); await loadDetail(selected.id);
  };

  const requestPart = async () => {
    const part = parts.find((p) => p.part_code === partForm.part_code);
    try {
      await api.post("/maintenance/spare-parts-requests", {
        part_code: partForm.part_code, part_name: part?.part_name || partForm.part_code,
        quantity: Number(partForm.quantity), work_order_id: selected.id, machine_id: selected.machine_id,
        reason: partForm.reason, priority: partForm.priority, comment: partForm.comment,
      });
      toast({ title: "Spare part request sent to Maintenance Supervisor" });
      setPartOpen(false); setPartForm({ part_code: "", quantity: 1, reason: "", priority: "Medium", comment: "" });
      await load(); await loadDetail(selected.id);
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const wo = selected;
  const actions = wo ? ACTION_MAP[wo.status] || [] : [];

  return (
    <div data-testid="tech-work-orders-page">
      <PageHeader title="Assigned Work Orders" description="Technical work assigned to you by the Maintenance Supervisor" />

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="w-64">
          <SearchableSelect
            options={[{ value: "", label: "All Statuses" }, ...(meta?.wo_statuses || []).map((s) => ({ value: s, label: s }))]}
            value={statusFilter} onChange={setStatusFilter} placeholder="Filter by status" testId="wo-status-filter" />
        </div>
        <span className="text-sm text-ink/60" data-testid="wo-count">{orders.length} work order(s)</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <WorkOrderRows orders={orders} selectedId={wo?.id} onSelect={(o) => loadDetail(o.id)}
                        emptyText="No work orders assigned to you." />

        {wo && (
          <Card className="bg-oat border-clay/40 h-fit" data-testid="wo-detail-panel">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-display text-lg font-bold text-ink">{wo.wo_id} &middot; {wo.issue_type}</h2>
                <StatusBadge status={wo.status} testId="wo-detail-status" />
              </div>
              <InfoGrid cols={3} items={[
                ["Work Order ID", wo.wo_id], ["Machine", wo.machine_label], ["Issue Type", wo.issue_type],
                ["Component", wo.component], ["Error Code", wo.error_code], ["Priority", <StatusBadge status={wo.priority} />],
                ["Work Type", wo.work_type], ["Assigned By", wo.assigned_by], ["Assigned At", fmt(wo.assigned_at)],
                ["Start Time", fmt(wo.start_at)], ["Due Date/Time", fmt(wo.due_at)],
                ["Machine QR Verified", wo.qr_verified ? "Yes" : "No"],
                ["Technical Health Score", detail?.work_order?.health_score],
                ["Flag Status", wo.flagged ? `${wo.flag?.reason}` : "No flags"],
                ["Technician Comment", wo.technician_comment], ["Supervisor Comment", wo.supervisor_comment],
                ["Description", wo.description],
              ]} />

              <div className="flex flex-wrap gap-2 pt-2 border-t border-stone">
                {wo.status === "Reached Machine" && !wo.qr_verified && (
                  <QRScanSim
                    large={false}
                    triggerLabel="Scan Machine QR"
                    testId="verify-machine-qr"
                    options={[
                      { qr_code_id: `MQR-${wo.machine_id}`, label: `Machine QR \u2013 ${wo.machine_label}`, sublabel: wo.machine_id },
                      ...(wo.machine_id !== "M001" ? [{ qr_code_id: "MQR-M001", label: "Machine QR \u2013 M001 \u2013 Gachibowli (wrong machine)", sublabel: "M001" }] : [{ qr_code_id: "MQR-M002", label: "Machine QR \u2013 M002 \u2013 Hitech City (wrong machine)", sublabel: "M002" }]),
                    ]}
                    onScan={verifyQR}
                    demoNote="Demo Mode: tap the matching machine QR to verify. Selecting another machine will be rejected."
                  />
                )}
                {actions.map((a) => (
                  <Button key={a} onClick={() => act(a)} data-testid={`wo-action-${a.toLowerCase().replace(/\s+/g, "-")}`}
                           disabled={a === "Start Diagnosis" && !wo.qr_verified}
                           className="bg-beet hover:bg-beet-hover text-bone">{a}</Button>
                ))}
                <Button variant="outline" onClick={() => navigate(`/technician/diagnostics?wo=${wo.id}&machine_id=${wo.machine_id}`)} data-testid="wo-goto-diagnostics">Record Diagnostics</Button>
                <Button variant="outline" onClick={() => navigate(`/technician/breakdown-repair?wo=${wo.id}`)} data-testid="wo-goto-repair">Record Repair</Button>
                <Button variant="outline" onClick={() => navigate(`/technician/component-testing?wo=${wo.id}&machine_id=${wo.machine_id}`)} data-testid="wo-goto-testing">Component Testing</Button>
                <Button variant="outline" onClick={() => setPartOpen(true)} data-testid="wo-request-part-btn">Request Spare Part</Button>
                <Button variant="outline" onClick={() => setFlagOpen(true)} data-testid="wo-flag-btn" className="border-red-300 text-red-700">Flag Issue</Button>
                <Button variant="ghost" onClick={() => setCommentOpen(true)} data-testid="wo-comment-btn">Add Comment</Button>
              </div>

              <div>
                <h3 className="font-display font-semibold text-ink mb-3">Timeline</h3>
                <Timeline history={wo.history || []} testId="wo-timeline" />
              </div>

              {detail && (
                <div className="text-xs text-ink/70 space-y-1 pt-2 border-t border-stone" data-testid="wo-evidence-summary">
                  <p>Diagnostics recorded: <b>{detail.diagnostics.length}</b> &middot; Component tests: <b>{detail.component_tests.length}</b> &middot; Calibrations: <b>{detail.calibrations.length}</b> &middot; Parts used: <b>{detail.parts_used.length}</b></p>
                  {detail.part_requests.map((r) => (
                    <p key={r.id} data-testid={`wo-part-request-${r.req_id}`}>{r.req_id}: {r.quantity}x {r.part_name} &mdash; {r.status}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={flagOpen} onOpenChange={setFlagOpen}>
        <DialogContent className="bg-bone" data-testid="flag-dialog">
          <DialogHeader><DialogTitle>Flag Issue</DialogTitle></DialogHeader>
          <SearchableSelect options={(meta?.flag_reasons || []).map((r) => ({ value: r, label: r }))}
                             value={flag.reason} onChange={(v) => setFlag({ ...flag, reason: v })}
                             placeholder="Select reason" testId="flag-reason-select" />
          <Textarea placeholder="Comment (mandatory)" value={flag.comment} onChange={(e) => setFlag({ ...flag, comment: e.target.value })}
                     className="bg-bone" data-testid="flag-comment-input" />
          <Button onClick={submitFlag} disabled={!flag.reason || !flag.comment.trim()} data-testid="flag-submit-btn"
                   className="bg-beet hover:bg-beet-hover text-bone">Raise Flag</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={commentOpen} onOpenChange={setCommentOpen}>
        <DialogContent className="bg-bone" data-testid="comment-dialog">
          <DialogHeader><DialogTitle>Add Comment</DialogTitle></DialogHeader>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} className="bg-bone" data-testid="wo-comment-input" />
          <Button onClick={submitComment} disabled={!comment.trim()} data-testid="wo-comment-submit-btn" className="bg-beet hover:bg-beet-hover text-bone">Save Comment</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={partOpen} onOpenChange={setPartOpen}>
        <DialogContent className="bg-bone" data-testid="part-request-dialog">
          <DialogHeader><DialogTitle>Request Spare Part</DialogTitle></DialogHeader>
          <SearchableSelect options={parts.map((p) => ({ value: p.part_code, label: `${p.part_name} (${p.part_code}) \u00b7 available ${p.available_qty}` }))}
                             value={partForm.part_code} onChange={(v) => setPartForm({ ...partForm, part_code: v })}
                             placeholder="Select part" testId="part-request-part-select" />
          <Input type="number" min={1} value={partForm.quantity} onChange={(e) => setPartForm({ ...partForm, quantity: e.target.value })}
                  className="bg-bone" data-testid="part-request-qty-input" />
          <SearchableSelect options={(meta?.priorities || []).map((p) => ({ value: p, label: p }))} value={partForm.priority}
                             onChange={(v) => setPartForm({ ...partForm, priority: v })} testId="part-request-priority-select" />
          <Textarea placeholder="Reason" value={partForm.reason} onChange={(e) => setPartForm({ ...partForm, reason: e.target.value })}
                     className="bg-bone" data-testid="part-request-reason-input" />
          <Textarea placeholder="Comment (optional)" value={partForm.comment} onChange={(e) => setPartForm({ ...partForm, comment: e.target.value })}
                     className="bg-bone" data-testid="part-request-comment-input" />
          <Button onClick={requestPart} disabled={!partForm.part_code || !partForm.reason} data-testid="part-request-submit-btn"
                   className="bg-beet hover:bg-beet-hover text-bone">Submit Request</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
