import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Mail } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

const FIELD_LABELS = [
  ["id", "Alert ID"], ["alert_type", "Alert Type"], ["machine_id", "Machine ID"], ["machine_label", "Machine Location"],
  ["slot_id", "Slot ID"], ["slot_type", "Slot Type"], ["ingredient_name", "Ingredient Name"],
  ["current_quantity", "Current Quantity"], ["unit", "Unit"], ["current_level_pct", "Current Level %"],
  ["full_capacity", "Full Capacity"], ["expiry_date", "Expiry Date"], ["replacement_due_date", "Replacement Due Date"],
  ["current_bin_id", "Current Bin ID"], ["current_bin_qr_code_id", "Current Bin QR Code ID"], ["priority", "Priority"],
  ["created_at", "Alert Created Time"],
];

const PRIORITIES = [{ value: "Low", label: "Low" }, { value: "Medium", label: "Medium" }, { value: "High", label: "High" }];

function Countdown({ createdAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!createdAt) return null;
  const ageMs = now - new Date(createdAt).getTime();
  const remainingMs = Math.max(0, 30 * 60 * 1000 - ageMs);
  const mm = Math.floor(remainingMs / 60000);
  const ss = Math.floor((remainingMs % 60000) / 1000);
  if (remainingMs <= 0) return null;
  return <span>{`${mm}m ${ss < 10 ? "0" : ""}${ss}s remaining before this can be emailed`}</span>;
}

export default function AlertDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [alert, setAlert] = useState(null);
  const [staffOptions, setStaffOptions] = useState([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [staff, setStaff] = useState("");
  const [startTime, setStartTime] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    api.get(`/alerts/${id}/detail`).then(({ data }) => setAlert(data)).catch(() => setAlert(null));
  }, [id]);

  useEffect(() => {
    load();
    api.get("/supervisor/users").then(({ data }) =>
      setStaffOptions(data.filter((u) => u.role === "operations_staff").map((u) => ({ value: u.username, label: `${u.name} (${u.username})` })))
    );
  }, [load]);

  if (!alert) {
    return (
      <div data-testid="alert-detail-page">
        <p className="text-sm text-ink/60">Loading alert details...</p>
      </div>
    );
  }

  const fmt = (key, val) => {
    if (val == null || val === "") return "\u2014";
    if (key === "created_at" || key.includes("date")) {
      const d = new Date(val);
      return isNaN(d.getTime()) ? val : d.toLocaleString();
    }
    if (key === "current_level_pct") return `${val}%`;
    return String(val);
  };

  const isOpen = alert.status === "Open";
  const kitchenTicketAge = alert.kitchen_ticket_created_at
    ? (Date.now() - new Date(alert.kitchen_ticket_created_at).getTime()) / 60000
    : null;
  const canEmail = alert.kitchen_prep_request_id && alert.pickup_task_status !== "Picked" && kitchenTicketAge != null && kitchenTicketAge >= 30;
  const emailDisabledReason = !alert.kitchen_prep_request_id
    ? "No Kitchen Fill Ticket linked yet"
    : alert.pickup_task_status === "Picked"
    ? "Ticket already picked up"
    : null;

  const act = async (fn, successMsg) => {
    setLoading(true);
    try {
      const { data } = await fn();
      toast({ title: successMsg || data.message });
      load();
    } catch (e) {
      toast({ title: "Action failed", description: formatApiError(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const emailKitchen = () => act(() => api.post(`/alerts/${id}/email-kitchen`), "Kitchen staff notified via email (simulated)");
  const closeAlert = () => act(() => api.post(`/alerts/${id}/close`), "Alert closed").then(() => navigate("/supervisor/alerts"));

  const submitAssign = () => {
    setLoading(true);
    api.post(`/alerts/${id}/assign`, {
      operations_staff: staff || null, start_time: startTime || null, due_time: dueTime || null,
      priority, comment: comment || null,
    }).then(({ data }) => {
      toast({ title: data.message });
      setAssignOpen(false);
      load();
    }).catch((e) => toast({ title: "Assign failed", description: formatApiError(e), variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  return (
    <div data-testid="alert-detail-page">
      <Button variant="ghost" size="sm" onClick={() => navigate("/supervisor/alerts")} data-testid="alert-detail-back-btn" className="mb-3">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Alerts
      </Button>
      <PageHeader title="Alert Detail" description="Read-only alert record shared across Alerts and Machine Control Center" />

      <Card className="bg-oat border-clay/40 mb-4">
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center gap-2">
            <StatusBadge status={alert.status} testId="alert-detail-status-badge" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            {FIELD_LABELS.map(([key, label]) => (
              <div key={key} data-testid={`alert-detail-field-${key}`}>
                <p className="text-xs text-ink/60">{label}</p>
                <p className="font-mono text-ink font-medium">{fmt(key, alert[key])}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs text-ink/60 mb-1">Recipes Affected</p>
            <div className="flex flex-wrap gap-1" data-testid="alert-detail-recipes-affected">
              {(alert.recipes_affected || []).map((r) => (
                <span key={r} className="text-xs bg-bone border border-clay/40 rounded-full px-2 py-0.5">{r}</span>
              ))}
              {(!alert.recipes_affected || alert.recipes_affected.length === 0) && <span className="text-xs text-ink/50">None</span>}
            </div>
          </div>

          <div>
            <p className="text-xs text-ink/60 mb-1">Suggested Action</p>
            <p className="text-sm bg-bone border border-clay/40 rounded-md p-3" data-testid="alert-detail-suggested-action">{alert.suggested_action}</p>
          </div>

          {alert.linked_kitchen_request && (
            <div data-testid="alert-detail-linked-ticket">
              <p className="text-xs text-ink/60 mb-1">Linked Kitchen Fill Ticket</p>
              <p className="text-sm font-mono">{alert.linked_kitchen_request.id} &middot; Status: {alert.linked_kitchen_request.status}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!isOpen || loading}
          onClick={() => setAssignOpen(true)}
          data-testid="alert-detail-assign-task-btn"
          className="bg-beet hover:bg-beet-hover text-bone"
        >
          Assign Task
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  disabled={!canEmail || loading}
                  onClick={emailKitchen}
                  data-testid="btn-email-kitchen"
                  variant="destructive"
                >
                  <Mail className="h-4 w-4 mr-1" /> Email Kitchen Staff
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {emailDisabledReason || (!canEmail ? <Countdown createdAt={alert.kitchen_ticket_created_at} /> : "Send an escalation email to Kitchen")}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button variant="outline" onClick={closeAlert} disabled={loading} data-testid="alert-detail-close-btn">
          Close
        </Button>
      </div>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="bg-bone" data-testid="assign-staff-modal">
          <DialogHeader>
            <DialogTitle>Assign Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-ink/60 mb-1 block">Operations Staff (optional — leave empty to auto-assign)</Label>
              <SearchableSelect options={staffOptions} value={staff} onChange={setStaff} placeholder="Auto-assign random available staff" testId="assign-modal-staff-select" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-ink/60 mb-1 block">Start Time</Label>
                <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                  data-testid="assign-modal-start-time" className="w-full bg-bone border border-clay/50 rounded-md px-3 py-2 text-sm text-ink" />
              </div>
              <div>
                <Label className="text-xs text-ink/60 mb-1 block">Due Time</Label>
                <input type="datetime-local" value={dueTime} onChange={(e) => setDueTime(e.target.value)}
                  data-testid="assign-modal-due-time" className="w-full bg-bone border border-clay/50 rounded-md px-3 py-2 text-sm text-ink" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-ink/60 mb-1 block">Priority</Label>
              <SearchableSelect options={PRIORITIES} value={priority} onChange={setPriority} testId="assign-modal-priority-select" />
            </div>
            <div>
              <Label className="text-xs text-ink/60 mb-1 block">Comment</Label>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} data-testid="assign-modal-comment" placeholder="Optional notes for the assignee" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button disabled={loading} onClick={submitAssign} className="bg-beet hover:bg-beet-hover text-bone" data-testid="assign-modal-submit-btn">
                {loading ? "Assigning…" : "Assign Task"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
