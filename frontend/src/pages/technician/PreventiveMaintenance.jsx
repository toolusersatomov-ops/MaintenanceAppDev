import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import InfoGrid from "@/components/maint/InfoGrid";
import PhotoCapture from "@/components/maint/PhotoCapture";
import { fmt } from "@/components/maint/useMaint";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

const STEP_STATUSES = ["Pass", "Needs Attention", "Fail", "Completed"];

export default function PreventiveMaintenance() {
  const [params] = useSearchParams();
  const statusFilter = params.get("status") || "";
  const [tasks, setTasks] = useState([]);
  const [active, setActive] = useState(null);
  const [drafts, setDrafts] = useState({});
  const { toast } = useToast();

  const load = useCallback(async () => {
    const { data } = await api.get(`/maintenance/pm-tasks${statusFilter ? `?status=${statusFilter}` : ""}`);
    setTasks(data);
    if (active) setActive(data.find((t) => t.id === active.id) || null);
  }, [statusFilter, active]);

  useEffect(() => { api.get(`/maintenance/pm-tasks${statusFilter ? `?status=${statusFilter}` : ""}`).then(({ data }) => setTasks(data)); }, [statusFilter]);

  const start = async (task) => {
    try {
      await api.post(`/maintenance/pm-tasks/${task.id}/start`);
      toast({ title: "Preventive maintenance started" });
      const { data } = await api.get("/maintenance/pm-tasks");
      setTasks(data);
      setActive(data.find((t) => t.id === task.id));
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const saveStep = async (step) => {
    const draft = drafts[step.step] || {};
    try {
      await api.post(`/maintenance/pm-tasks/${active.id}/step`, {
        step: step.step, status: draft.status || step.status, comment: draft.comment ?? step.comment,
        before_photo: draft.before_photo || step.before_photo, after_photo: draft.after_photo || step.after_photo,
      });
      const { data } = await api.get("/maintenance/pm-tasks");
      setTasks(data);
      setActive(data.find((t) => t.id === active.id));
      setDrafts((prev) => ({ ...prev, [step.step]: {} }));
    } catch (e) {
      toast({ title: "Step not saved", description: formatApiError(e), variant: "destructive" });
    }
  };

  const submit = async () => {
    try {
      const { data } = await api.post(`/maintenance/pm-tasks/${active.id}/submit`);
      toast({ title: data.message });
      const res = await api.get("/maintenance/pm-tasks");
      setTasks(res.data);
      setActive(null);
    } catch (e) {
      toast({ title: "Cannot submit yet", description: formatApiError(e), variant: "destructive" });
    }
  };

  const steps = active?.steps || [];
  const done = steps.filter((s) => s.status !== "Not Started").length;

  return (
    <div data-testid="preventive-maintenance-page">
      <PageHeader title="Preventive Maintenance" description="Scheduled PM visits assigned to you with the 31-point checklist" />

      {!active && (
        <div className="space-y-2">
          {tasks.length === 0 && <p className="text-sm text-ink/60" data-testid="pm-tasks-empty">No preventive maintenance tasks assigned to you.</p>}
          {tasks.map((t) => (
            <Card key={t.id} className="bg-oat border-clay/40" data-testid={`pm-task-${t.pm_id}`}>
              <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink"><span className="font-mono text-beet">{t.pm_id}</span> {t.pm_type} &middot; {t.frequency}</p>
                  <p className="text-xs text-ink/60 font-mono">{t.machine_label} &middot; Due {fmt(t.due_at)} &middot; {t.checklist_template}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={t.priority} />
                  <StatusBadge status={t.status} testId={`pm-status-${t.pm_id}`} />
                  <Button size="sm" onClick={() => (t.steps?.some((s) => s.status !== "Not Started") ? setActive(t) : start(t))}
                           data-testid={`pm-open-${t.pm_id}`} className="bg-beet hover:bg-beet-hover text-bone">
                    {t.status === "Completed" ? "View Checklist" : t.status === "In Progress" ? "Continue" : "Start PM"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {active && (
        <Card className="bg-oat border-clay/40" data-testid="pm-checklist-panel">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-display text-lg font-bold text-ink">{active.pm_id} &middot; {active.machine_label}</h2>
              <div className="flex items-center gap-2">
                <StatusBadge status={active.status} />
                <Button variant="outline" size="sm" onClick={() => setActive(null)} data-testid="pm-back-btn">Back to list</Button>
              </div>
            </div>
            <InfoGrid items={[
              ["PM Type", active.pm_type], ["Frequency", active.frequency], ["Scheduled", fmt(active.scheduled_at)],
              ["Due", fmt(active.due_at)], ["Technician", active.technician], ["Priority", active.priority],
              ["Checklist Template", active.checklist_template], ["Progress", `${done} / ${steps.length} steps`],
              ["Supervisor Comment", active.comment],
            ]} />

            <div className="rounded-md border border-stone overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone text-left">
                    {["Checklist Step", "Status", "Comment", "Before Photo", "After Photo", "Completed", ""].map((h) => (
                      <th key={h} className="p-2 font-semibold text-ink whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {steps.map((s) => {
                    const slug = s.step.toLowerCase().replace(/[\s/]+/g, "-");
                    const draft = drafts[s.step] || {};
                    return (
                      <tr key={s.step} className="border-b border-stone/60" data-testid={`pm-step-${slug}`}>
                        <td className="p-2 text-ink font-medium whitespace-nowrap">
                          {s.step}{s.requires_photo && <span className="ml-1 text-xs text-beet">*photo</span>}
                        </td>
                        <td className="p-2">
                          <div className="flex gap-1 flex-wrap">
                            {STEP_STATUSES.map((st) => (
                              <button key={st} onClick={() => setDrafts((p) => ({ ...p, [s.step]: { ...draft, status: st } }))}
                                       data-testid={`pm-step-status-${slug}-${st.toLowerCase().replace(/\s+/g, "-")}`}
                                       className={`px-2 py-1 rounded text-xs border ${(draft.status || s.status) === st ? "bg-beet text-bone border-beet" : "bg-bone text-ink border-clay/50"}`}>{st}</button>
                            ))}
                          </div>
                        </td>
                        <td className="p-2 w-48">
                          <Input value={draft.comment ?? s.comment ?? ""} onChange={(e) => setDrafts((p) => ({ ...p, [s.step]: { ...draft, comment: e.target.value } }))}
                                  className="bg-bone h-8" data-testid={`pm-step-comment-${slug}`} />
                        </td>
                        <td className="p-2">
                          <PhotoCapture slug={`pm-before-${slug}`} value={draft.before_photo || s.before_photo}
                                         onCapture={(ph) => setDrafts((p) => ({ ...p, [s.step]: { ...draft, before_photo: ph } }))}
                                         label="Before" testId={`pm-before-photo-${slug}`} />
                        </td>
                        <td className="p-2">
                          <PhotoCapture slug={`pm-after-${slug}`} value={draft.after_photo || s.after_photo}
                                         onCapture={(ph) => setDrafts((p) => ({ ...p, [s.step]: { ...draft, after_photo: ph } }))}
                                         label="After" testId={`pm-after-photo-${slug}`} />
                        </td>
                        <td className="p-2 text-xs text-ink/60 whitespace-nowrap">{s.completed_at ? fmt(s.completed_at) : "\u2014"}</td>
                        <td className="p-2">
                          <Button size="sm" variant="outline" onClick={() => saveStep(s)} data-testid={`pm-step-save-${slug}`}>Save</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={submit} disabled={done < steps.length || active.status === "Completed"}
                       data-testid="pm-submit-btn" className="bg-beet hover:bg-beet-hover text-bone">
                Submit PM for Supervisor Review
              </Button>
              <p className="text-xs text-ink/60">{done} of {steps.length} checklist steps recorded. Steps marked <b>*photo</b> require an after photo.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
