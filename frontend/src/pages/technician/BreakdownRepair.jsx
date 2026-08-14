import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import InfoGrid from "@/components/maint/InfoGrid";
import PhotoCapture from "@/components/maint/PhotoCapture";
import { useMeta, fmt } from "@/components/maint/useMaint";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

const EMPTY = {
  failed_component: "", diagnosis_summary: "", root_cause: "", repair_action: "", parts_used: "",
  before_photo: "", after_photo: "", testing_result: "", comment: "", repair_start_time: "", repair_end_time: "",
};

export default function BreakdownRepair() {
  const meta = useMeta();
  const [params] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [woId, setWoId] = useState(params.get("wo") || "");
  const [form, setForm] = useState(EMPTY);
  const { toast } = useToast();

  const load = () => api.get("/maintenance/work-orders?active=true").then(({ data }) => setOrders(data));
  useEffect(() => { load(); }, []);

  const wo = orders.find((o) => o.id === woId);
  useEffect(() => {
    if (wo) setForm((f) => ({ ...f, failed_component: f.failed_component || wo.component || "" }));
  }, [wo]);

  const submit = async () => {
    try {
      const { data } = await api.post("/maintenance/repairs", {
        work_order_id: woId, issue: wo?.issue_type, error_code: wo?.error_code, ...form,
      });
      toast({ title: data.message });
      setForm(EMPTY);
      load();
    } catch (e) {
      toast({ title: "Could not save repair", description: formatApiError(e), variant: "destructive" });
    }
  };

  return (
    <div data-testid="breakdown-repair-page">
      <PageHeader title="Breakdown Repair" description="Record the diagnosis, root cause and repair carried out on a machine" />

      <div className="max-w-2xl mb-4">
        <SearchableSelect
          options={orders.filter((o) => ["Breakdown", "Emergency Visit", "Part Replacement", "Inspection"].includes(o.work_type))
            .map((o) => ({ value: o.id, label: `${o.wo_id} \u00b7 ${o.issue_type} \u00b7 ${o.machine_label} \u00b7 ${o.status}` }))}
          value={woId} onChange={setWoId} placeholder="Select Work Order" testId="repair-wo-select" />
      </div>

      {wo && (
        <Card className="bg-oat border-clay/40 mb-4" data-testid="repair-wo-summary">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="font-display font-bold text-ink">{wo.wo_id} &middot; {wo.machine_label}</p>
              <StatusBadge status={wo.status} />
            </div>
            <InfoGrid items={[
              ["Issue", wo.issue_type], ["Error Code", wo.error_code], ["Component", wo.component],
              ["Priority", wo.priority], ["Machine QR Verified", wo.qr_verified ? "Yes" : "No"], ["Due", fmt(wo.due_at)],
            ]} />
          </CardContent>
        </Card>
      )}

      {wo && (
        <Card className="bg-oat border-clay/40" data-testid="repair-form-card">
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs uppercase text-ink/60">Failed Component</label>
                <SearchableSelect options={(meta?.component_categories || []).map((c) => ({ value: c, label: c }))}
                                   value={form.failed_component} onChange={(v) => setForm({ ...form, failed_component: v })}
                                   placeholder="Select component category" testId="repair-component-select" />
              </div>
              <div>
                <label className="text-xs uppercase text-ink/60">Testing Result</label>
                <Input value={form.testing_result} onChange={(e) => setForm({ ...form, testing_result: e.target.value })}
                        placeholder="e.g. Pass \u2013 3 test cycles OK" className="bg-bone" data-testid="repair-testing-result-input" />
              </div>
              <div>
                <label className="text-xs uppercase text-ink/60">Repair Start Time</label>
                <Input type="datetime-local" value={form.repair_start_time} onChange={(e) => setForm({ ...form, repair_start_time: e.target.value })}
                        className="bg-bone" data-testid="repair-start-time-input" />
              </div>
              <div>
                <label className="text-xs uppercase text-ink/60">Repair End Time</label>
                <Input type="datetime-local" value={form.repair_end_time} onChange={(e) => setForm({ ...form, repair_end_time: e.target.value })}
                        className="bg-bone" data-testid="repair-end-time-input" />
              </div>
            </div>

            <Textarea placeholder="Diagnosis Summary" value={form.diagnosis_summary} onChange={(e) => setForm({ ...form, diagnosis_summary: e.target.value })}
                       className="bg-bone" data-testid="repair-diagnosis-input" />
            <Textarea placeholder="Root Cause" value={form.root_cause} onChange={(e) => setForm({ ...form, root_cause: e.target.value })}
                       className="bg-bone" data-testid="repair-root-cause-input" />
            <Textarea placeholder="Repair Action" value={form.repair_action} onChange={(e) => setForm({ ...form, repair_action: e.target.value })}
                       className="bg-bone" data-testid="repair-action-input" />
            <Input placeholder="Parts Used (e.g. Peristaltic Pump x1)" value={form.parts_used} onChange={(e) => setForm({ ...form, parts_used: e.target.value })}
                    className="bg-bone" data-testid="repair-parts-used-input" />
            <Textarea placeholder="Technician Comment" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })}
                       className="bg-bone" data-testid="repair-comment-input" />

            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-xs uppercase text-ink/60 mb-1">Before Photo (required)</p>
                <PhotoCapture slug="repair-before" value={form.before_photo} onCapture={(p) => setForm({ ...form, before_photo: p })}
                               label="Capture Before Photo" testId="repair-before-photo" />
              </div>
              <div>
                <p className="text-xs uppercase text-ink/60 mb-1">After Photo (required)</p>
                <PhotoCapture slug="repair-after" value={form.after_photo} onCapture={(p) => setForm({ ...form, after_photo: p })}
                               label="Capture After Photo" testId="repair-after-photo" />
              </div>
            </div>

            <Button onClick={submit}
                     disabled={!form.failed_component || !form.diagnosis_summary || !form.root_cause || !form.repair_action || !form.before_photo || !form.after_photo}
                     data-testid="repair-submit-btn" className="bg-beet hover:bg-beet-hover text-bone">
              Save Repair Record
            </Button>
            <p className="text-xs text-ink/60">Component testing is mandatory before a work order can be submitted for supervisor review.</p>
          </CardContent>
        </Card>
      )}

      {!wo && <p className="text-sm text-ink/60" data-testid="repair-no-selection">Select one of your active work orders to record a repair.</p>}
    </div>
  );
}
