import React, { useEffect, useState, useCallback } from "react";
import { Camera, MessageSquare, CheckCircle2, AlertTriangle, Image as ImageIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "Not Started", label: "Not Started" },
  { value: "In Progress", label: "In Progress" },
  { value: "Completed", label: "Completed" },
  { value: "Overdue", label: "Overdue" },
  { value: "Pending Supervisor Review", label: "Pending Supervisor Review" },
];

export default function CleaningTracking() {
  const [rows, setRows] = useState([]);
  const [machines, setMachines] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [f, setF] = useState({ machine: "", staff: "", status: "", date: "" });
  const [detail, setDetail] = useState(null);
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    api.get("/catalog/machines").then(({ data }) => setMachines([{ value: "", label: "All Machines" }, ...data.map((m) => ({ value: m.id, label: m.label || m.id }))]));
    api.get("/supervisor/users").then(({ data }) => setStaffOptions([{ value: "", label: "All Operations Staff" }, ...data.filter((u) => u.role === "operations_staff").map((u) => ({ value: u.username, label: `${u.name} (${u.username})` }))]));
  }, []);

  const load = useCallback(() => {
    const q = new URLSearchParams();
    if (f.machine) q.set("machine_id", f.machine);
    if (f.staff) q.set("staff", f.staff);
    if (f.status) q.set("status", f.status);
    if (f.date) q.set("date", f.date);
    api.get(`/supervisor/cleaning-tracking?${q.toString()}`).then(({ data }) => setRows(data));
  }, [f]);
  useEffect(() => { load(); }, [load]);

  const review = async (taskId, action) => {
    try {
      await api.post(`/supervisor/cleaning-tracking/${taskId}/review`, { action, comment });
      toast({ title: action === "escalate" ? "Cleaning escalated to Operations Staff" : action === "mark_reviewed" ? "Marked reviewed" : "Comment saved" });
      setComment("");
      setDetail(null);
      load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  return (
    <div data-testid="cleaning-tracking-page">
      <PageHeader title="Machine Cleaning & Sanitization Tracking" description="Track cleaning status by machine and operations staff, with live step progress" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5" data-testid="cleaning-tracking-filters">
        <SearchableSelect options={machines} value={f.machine} onChange={(v) => setF({ ...f, machine: v })} placeholder="Machine" testId="ct-filter-machine" />
        <SearchableSelect options={staffOptions} value={f.staff} onChange={(v) => setF({ ...f, staff: v })} placeholder="Operations Staff" testId="ct-filter-staff" />
        <SearchableSelect options={STATUS_OPTIONS} value={f.status} onChange={(v) => setF({ ...f, status: v })} placeholder="Status" testId="ct-filter-status" />
        <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="bg-oat" data-testid="ct-filter-date" />
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.machine_id} className="bg-oat border-clay/40 cursor-pointer hover:border-beet/60 transition-colors"
                onClick={() => r.cleaning_task_id && setDetail(r)} data-testid={`cleaning-tracking-row-${r.machine_id}`}>
            <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-ink">{r.machine_label}</p>
                <p className="text-xs text-ink/60 font-mono">
                  Last cleaned: {r.last_cleaning_date ? new Date(r.last_cleaning_date).toLocaleString() : "Never"}
                  {r.last_cleaned_by ? ` by ${r.last_cleaned_by}` : ""}
                  {r.next_cleaning_due ? ` · Next due: ${new Date(r.next_cleaning_due).toLocaleString()}` : ""}
                </p>
                <p className="text-xs font-mono mt-1">
                  Steps: {r.steps_completed}/{r.total_steps || "-"} · Photos: {r.photo_proof_count} · Review: {r.review_status}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {r.status === "Overdue" && <AlertTriangle className="h-4 w-4 text-beet" />}
                <StatusBadge status={r.status} />
              </div>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && <p className="text-sm text-ink/60 py-6 text-center" data-testid="cleaning-tracking-empty">No machines match the current filters.</p>}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="bg-bone max-h-[85vh] overflow-y-auto max-w-2xl" data-testid="cleaning-tracking-detail">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.machine_label} — Cleaning Progress ({detail.task_date})</DialogTitle>
              </DialogHeader>
              <div className="space-y-1.5">
                {detail.steps.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-md bg-oat border border-clay/40 text-sm" data-testid={`ct-step-${i}`}>
                    <div className="min-w-0">
                      <p className="font-medium text-ink truncate">{i + 1}. {s.name}</p>
                      <p className="text-xs text-ink/60 font-mono">
                        {s.completed ? `Done${s.completed_by ? ` by ${s.completed_by}` : ""}${s.completed_at ? ` · ${new Date(s.completed_at).toLocaleTimeString()}` : ""}` : "Pending"}
                        {s.comment ? ` · "${s.comment}"` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {s.photo && (
                        <button onClick={() => setPhoto(s.photo)} className="text-beet" data-testid={`ct-view-photo-${i}`} title="View Photo Proof">
                          <ImageIcon className="h-4 w-4" />
                        </button>
                      )}
                      {s.completed ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Camera className="h-4 w-4 text-ink/30" />}
                    </div>
                  </div>
                ))}
              </div>
              {detail.supervisor_comment && <p className="text-xs text-ink/70 bg-stone/40 rounded p-2">Supervisor: {detail.supervisor_comment}</p>}
              <Textarea placeholder="Supervisor comment…" value={comment} onChange={(e) => setComment(e.target.value)} className="bg-oat" data-testid="ct-comment-input" />
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" onClick={() => review(detail.cleaning_task_id, "comment")} variant="outline" data-testid="ct-save-comment-btn">
                  <MessageSquare className="h-4 w-4 mr-1" /> Add Comment
                </Button>
                <Button size="sm" onClick={() => review(detail.cleaning_task_id, "mark_reviewed")} className="bg-beet hover:bg-beet-hover text-bone" data-testid="ct-mark-reviewed-btn">
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Mark Reviewed
                </Button>
                <Button size="sm" onClick={() => review(detail.cleaning_task_id, "escalate")} variant="destructive" data-testid="ct-escalate-btn">
                  <AlertTriangle className="h-4 w-4 mr-1" /> Escalate Cleaning
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!photo} onOpenChange={(o) => !o && setPhoto(null)}>
        <DialogContent className="bg-bone" data-testid="cleaning-photo-dialog">
          <DialogHeader><DialogTitle>Photo Proof</DialogTitle></DialogHeader>
          {photo && <img src={photo} alt="Photo proof" className="w-full rounded-md border border-clay/40" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
