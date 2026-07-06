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
import api from "@/lib/api";

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
          {task.steps.map((s, i) => <StepCard key={i} task={task} step={s} index={i} onRefresh={load} />)}
        </div>
      )}
    </div>
  );
}
