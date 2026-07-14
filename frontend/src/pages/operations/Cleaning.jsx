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
  const [selectedLine, setSelectedLine] = useState(null);
  const [flushing, setFlushing] = useState(null);
  const fileRef = useRef(null);
  const { toast } = useToast();
  const cip = task.cip || { pump_started_at: null, pump_stopped_at: null, lines: {} };
  const lines = cip.lines || {};
  const pumpRunning = cip.pump_started_at && !cip.pump_stopped_at;
  const allLinesDone = Object.keys(lines).length > 0 && Object.values(lines).every((s) => s === "Completed");
  const completedCount = Object.values(lines).filter((s) => s === "Completed").length;

  const flushSelectedLine = async () => {
    if (!selectedLine) return;
    try {
      if (!pumpRunning) {
        await api.post(`/operations/cleaning/${task.id}/cip/pump`, { action: "start" });
      }
      await api.post(`/operations/cleaning/${task.id}/cip/line`, { line: selectedLine });
      setFlushing(selectedLine);
      await new Promise((r) => setTimeout(r, 2500));
      await api.post(`/operations/cleaning/${task.id}/cip/line`, { line: selectedLine });
      setFlushing(null);
      toast({ title: `${lineLabel(selectedLine)} flushed and completed` });
      setSelectedLine(null);
      onRefresh();
    } catch (e) {
      setFlushing(null);
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
      onRefresh();
    }
  };

  const stopPump = async () => {
    try {
      const { data } = await api.post(`/operations/cleaning/${task.id}/cip/pump`, { action: "stop" });
      toast({ title: data.message });
      onRefresh();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const markComplete = async () => {
    try {
      await api.post(`/operations/cleaning/${task.id}/steps/${index}`, { photo: preview, comment });
      toast({ title: "CIP marked complete" });
      onRefresh();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const lineLabel = (code) => (code === "L11" ? "Water Line / L11" : `Liquid Line ${code}`);

  return (
    <Card className="bg-oat border-beet/40 sm:col-span-2 lg:col-span-3" data-testid="cip-step-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm text-ink">{index + 1}. CIP — Cleaning In Place</p>
            <p className="text-xs text-ink/60">Select a line, start the hot water pump, and flush lines one by one. ({completedCount}/{Object.keys(lines).length} lines done)</p>
          </div>
          {step.completed && <Check className="h-4 w-4 text-green-600" />}
        </div>

        {!step.completed && (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2" data-testid="cip-lines-grid">
              {Object.entries(lines).map(([code, lstatus]) => {
                const done = lstatus === "Completed";
                const isSelected = selectedLine === code;
                const isFlushing = flushing === code;
                return (
                  <button key={code} disabled={done || !!flushing}
                          onClick={() => setSelectedLine(isSelected ? null : code)}
                          data-testid={`cip-line-${code}`}
                          className={`p-2 rounded-md border text-xs font-medium transition-colors ${
                            done ? "bg-green-100 border-green-300 text-green-800 cursor-default"
                            : isFlushing ? "bg-sky-100 border-sky-400 text-sky-800"
                            : isSelected ? "bg-beet/10 border-beet text-beet"
                            : "bg-bone border-clay/40 text-ink hover:border-beet/50"}`}>
                    {code === "L11" ? "Water / L11" : code}
                    <span className="block text-[10px] font-mono mt-0.5 opacity-70">{done ? "Completed" : isFlushing ? "Running" : lstatus === "Running" ? "Running" : "Not Started"}</span>
                  </button>
                );
              })}
            </div>

            {flushing && (
              <div className="rounded-md border border-sky-300 bg-sky-50 p-3" data-testid="cip-flush-animation">
                <p className="text-xs font-semibold text-sky-800 mb-2">Hot water flowing through {lineLabel(flushing)}…</p>
                <div className="h-2.5 rounded-full bg-sky-100 overflow-hidden">
                  <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-sky-300 via-sky-500 to-sky-300 animate-cip-flow" />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 items-center">
              <Button size="sm" disabled={!selectedLine || !!flushing} onClick={flushSelectedLine}
                      data-testid="cip-pump-start-btn" className="bg-beet hover:bg-beet-hover text-bone">
                {flushing ? "Flushing…" : selectedLine ? `Start Hot Water Pump — ${lineLabel(selectedLine)}` : "Select a line to flush"}
              </Button>
              <Button size="sm" variant="outline" disabled={!allLinesDone || !pumpRunning || !!flushing} onClick={stopPump} data-testid="cip-pump-stop-btn">
                Stop Hot Water Pump
              </Button>
              <span className="text-xs font-mono text-ink/60" data-testid="cip-pump-status">
                Pump: {pumpRunning ? "Running" : cip.pump_stopped_at ? "Stopped" : "Not Started"}
              </span>
            </div>
          </>
        )}

        {preview && <img src={preview} alt="preview" className="h-24 w-full object-cover rounded-md border border-clay/40" />}
        <input type="file" accept="image/*" ref={fileRef} className="hidden" onChange={(e) => { const file = e.target.files[0]; if (file) setPreview(URL.createObjectURL(file)); }} data-testid="cip-file-input" />
        <div className="flex flex-wrap gap-2 items-start">
          <Button variant="outline" size="sm" disabled={step.completed} onClick={() => fileRef.current.click()} data-testid="cip-photo-btn">
            <Camera className="h-4 w-4 mr-2" /> Photo (optional)
          </Button>
          <Button size="sm" disabled={step.completed || !allLinesDone || !cip.pump_stopped_at} onClick={markComplete}
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
