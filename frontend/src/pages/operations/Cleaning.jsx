import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Camera, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import useAssignedMachines from "@/hooks/useAssignedMachines";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

function StepCard({ task, step, index, onRefresh }) {
  const [preview, setPreview] = useState(step.photo || null);
  const [comment, setComment] = useState(step.comment || "");
  const fileRef = useRef(null);
  const { toast } = useToast();

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
  };

  const markComplete = async () => {
    try {
      await api.post(`/operations/cleaning/${task.id}/steps/${index}`, { photo: preview || "captured", comment });
      toast({ title: `${step.name} marked complete` });
      onRefresh();
    } catch (e) {
      toast({ title: "Failed", variant: "destructive" });
    }
  };

  return (
    <Card className="bg-oat border-clay/40" data-testid={`cleaning-step-${index}`}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm text-ink">{index + 1}. {step.name}</p>
          {step.completed && <Check className="h-4 w-4 text-green-600" />}
        </div>
        {preview && <img src={preview} alt="preview" className="h-24 w-full object-cover rounded-md border border-clay/40" data-testid={`cleaning-step-photo-preview-${index}`} />}
        <input type="file" accept="image/*" ref={fileRef} className="hidden" onChange={handleFile} data-testid={`cleaning-step-file-input-${index}`} />
        <Button variant="outline" size="sm" disabled={step.completed} onClick={() => fileRef.current.click()} data-testid={`cleaning-step-photo-btn-${index}`}>
          <Camera className="h-4 w-4 mr-2" /> Camera / Upload Photo
        </Button>
        <Textarea placeholder="Comment (optional)" value={comment} disabled={step.completed} onChange={(e) => setComment(e.target.value)} className="bg-bone" data-testid={`cleaning-step-comment-${index}`} />
        <Button size="sm" disabled={!preview || step.completed} onClick={markComplete} data-testid={`cleaning-step-complete-btn-${index}`} className="bg-beet hover:bg-beet-hover text-bone">
          Mark Complete
        </Button>
      </CardContent>
    </Card>
  );
}

function CipCard({ task, step, index, onRefresh }) {
  const [preview, setPreview] = useState(step.photo || null);
  const [comment, setComment] = useState(step.comment || "");
  const fileRef = useRef(null);
  const { toast } = useToast();
  const cip = task.cip || { pump_started_at: null, pump_stopped_at: null, lines: {} };
  const lines = cip.lines || {};
  const pumpRunning = cip.pump_started_at && !cip.pump_stopped_at;
  const allLinesDone = Object.keys(lines).length > 0 && Object.values(lines).every((s) => s === "Completed");

  const pump = async (action) => {
    try {
      const { data } = await api.post(`/operations/cleaning/${task.id}/cip/pump`, { action });
      toast({ title: data.message });
      onRefresh();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const runLine = async (line) => {
    try {
      const { data } = await api.post(`/operations/cleaning/${task.id}/cip/line`, { line });
      toast({ title: data.message });
      onRefresh();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const markComplete = async () => {
    try {
      await api.post(`/operations/cleaning/${task.id}/steps/${index}`, { photo: preview || "captured", comment });
      toast({ title: "CIP marked complete" });
      onRefresh();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const lineLabel = (code) => (code === "L11" ? "Water Line / L11" : `Liquid Line ${code}`);
  const lineColor = { "Not Started": "bg-stone/50 text-ink/60", Running: "bg-amber-200 text-amber-900", Completed: "bg-green-200 text-green-900" };

  return (
    <Card className="bg-oat border-beet/40 sm:col-span-2 lg:col-span-3" data-testid="cip-step-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm text-ink">{index + 1}. CIP — Cleaning In Place</p>
            <p className="text-xs text-ink/60">Flushes internal machine pipes with hot water. Run every liquid line before completing.</p>
          </div>
          {step.completed && <Check className="h-4 w-4 text-green-600" />}
        </div>

        {!step.completed && (
          <>
            <div className="flex gap-2">
              <Button size="sm" disabled={!!pumpRunning} onClick={() => pump("start")} data-testid="cip-pump-start-btn" className="bg-beet hover:bg-beet-hover text-bone">
                Start Hot Water Pump
              </Button>
              <Button size="sm" variant="outline" disabled={!pumpRunning} onClick={() => pump("stop")} data-testid="cip-pump-stop-btn">
                Stop Hot Water Pump
              </Button>
              <span className="text-xs font-mono self-center text-ink/60" data-testid="cip-pump-status">
                Pump: {pumpRunning ? "Running" : cip.pump_stopped_at ? "Stopped" : "Not Started"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2" data-testid="cip-lines-grid">
              {Object.entries(lines).map(([code, lstatus]) => (
                <button key={code} onClick={() => lstatus !== "Completed" && runLine(code)} data-testid={`cip-line-${code}`}
                        className={`text-left p-2 rounded-md border border-clay/40 text-xs transition-colors ${lstatus !== "Completed" && pumpRunning ? "hover:border-beet/60 cursor-pointer" : "cursor-default"}`}>
                  <p className="font-medium text-ink truncate">Run Hot Water — {lineLabel(code)}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full font-mono ${lineColor[lstatus]}`}>{lstatus}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {preview && <img src={preview} alt="preview" className="h-24 w-full object-cover rounded-md border border-clay/40" />}
        <input type="file" accept="image/*" ref={fileRef} className="hidden" onChange={(e) => { const file = e.target.files[0]; if (file) setPreview(URL.createObjectURL(file)); }} data-testid="cip-file-input" />
        <div className="flex flex-wrap gap-2 items-start">
          <Button variant="outline" size="sm" disabled={step.completed} onClick={() => fileRef.current.click()} data-testid="cip-photo-btn">
            <Camera className="h-4 w-4 mr-2" /> Camera / Upload Photo
          </Button>
          <Button size="sm" disabled={!preview || step.completed || !allLinesDone || !cip.pump_stopped_at} onClick={markComplete}
                  data-testid="cip-complete-btn" className="bg-beet hover:bg-beet-hover text-bone">
            Mark CIP Complete
          </Button>
        </div>
        <Textarea placeholder="Comment (optional)" value={comment} disabled={step.completed} onChange={(e) => setComment(e.target.value)} className="bg-bone" data-testid="cip-comment" />
      </CardContent>
    </Card>
  );
}

export default function Cleaning() {
  const [params] = useSearchParams();
  const { options } = useAssignedMachines();
  const [machineId, setMachineId] = useState(params.get("machine") || "");
  const [task, setTask] = useState(null);

  useEffect(() => { if (options.length && !machineId) setMachineId(options[0].value); }, [options, machineId]);

  const load = useCallback(() => {
    if (!machineId) return;
    api.get(`/operations/cleaning?machine_id=${machineId}`).then(({ data }) => setTask(data));
  }, [machineId]);
  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="cleaning-sanitization-page">
      <PageHeader title="Cleaning & Sanitization" description="Complete each checklist step with a photo before marking it done" actions={task && <StatusBadge status={task.status} />} />
      <div className="max-w-md mb-6">
        <SearchableSelect options={options} value={machineId} onChange={setMachineId} testId="cleaning-machine-select" />
      </div>
      {task && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {task.steps.map((s, i) => s.name === "CIP"
            ? <CipCard key={i} task={task} step={s} index={i} onRefresh={load} />
            : <StepCard key={i} task={task} step={s} index={i} onRefresh={load} />)}
        </div>
      )}
    </div>
  );
}
