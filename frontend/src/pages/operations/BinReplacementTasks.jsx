import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import QRScanSim from "@/components/shared/QRScanSim";
import RecentScanPanel from "@/components/shared/RecentScanPanel";
import useAssignedMachines from "@/hooks/useAssignedMachines";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

function TaskCard({ task, onRefresh }) {
  const [scanOptions, setScanOptions] = useState({ new_bin: [], slot: [], old_bin: [] });
  const [recentScan, setRecentScan] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    api.get(`/operations/bin-replacement-tasks/${task.id}/scan-options`).then(({ data }) => setScanOptions(data));
  }, [task]);

  const call = async (fn, msg) => {
    try {
      const { data } = await fn();
      toast({ title: msg || data.message });
      onRefresh();
      return data;
    } catch (e) {
      toast({ title: "Action failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const removeOld = () => call(() => api.post(`/operations/bin-replacement-tasks/${task.id}/remove-old`));
  const scanNewBin = (qr) => call(() => api.post(`/operations/bin-replacement-tasks/${task.id}/scan-new-bin`, { qr_code_id: qr }));
  const scanSlot = (qr) => call(() => api.post(`/operations/bin-replacement-tasks/${task.id}/scan-slot`, { qr_code_id: qr }));
  const scanOldBin = async (qr) => {
    const data = await call(() => api.post(`/operations/bin-replacement-tasks/${task.id}/scan-old-bin`, { qr_code_id: qr }));
    if (data?.scan_action_id) {
      setRecentScan({ id: data.scan_action_id, qr_code_id: qr, affected_record_type: "bin_replacement_task", status_before: "In Machine", status_after: "Old Bin Removed & Dirty", scanned_by: "you", scanned_at: new Date().toISOString() });
    }
  };
  const complete = () => call(() => api.post(`/operations/bin-replacement-tasks/${task.id}/complete`), "Replacement Completed");
  const undoScan = async (id, comment) => {
    await api.post(`/operations/scan-actions/${id}/undo`, { comment });
    setRecentScan(null);
    onRefresh();
  };

  return (
    <Card className="bg-oat border-clay/40" data-testid={`bin-replacement-task-${task.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="font-semibold text-ink">{task.ingredient_name}</p>
            <p className="text-xs text-ink/60 font-mono">{task.machine_label}</p>
          </div>
          <StatusBadge status={task.status} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button variant={task.old_bin_removed ? "secondary" : "outline"} onClick={removeOld} disabled={task.old_bin_removed} data-testid={`remove-old-bin-btn-${task.id}`}>
            {task.old_bin_removed ? <Check className="h-4 w-4 mr-1" /> : null} 1. Remove Old Bin
          </Button>
          <QRScanSim
            options={scanOptions.new_bin} onScan={scanNewBin} large={false} disabled={task.new_bin_scanned}
            triggerLabel={task.new_bin_scanned ? "New Bin Placed \u2713" : "2. Scan New Bin QR"} testId={`scan-new-bin-btn-${task.id}`}
            emptyText="New bin not yet picked up from Kitchen."
          />
          <QRScanSim
            options={scanOptions.slot} onScan={scanSlot} large={false} disabled={!task.new_bin_scanned || task.slot_scanned}
            triggerLabel={task.slot_scanned ? "Placed in Machine \u2713" : "3. Scan Machine Slot QR"} testId={`scan-slot-btn-${task.id}`}
          />
          <QRScanSim
            options={scanOptions.old_bin} onScan={scanOldBin} large={false} disabled={!task.slot_scanned || task.old_bin_scanned}
            triggerLabel={task.old_bin_scanned ? "Old Bin Scanned \u2713" : "4. Scan Removed Old Bin QR"} testId={`scan-old-bin-btn-${task.id}`}
          />
        </div>

        {recentScan && <RecentScanPanel scan={recentScan} onConfirm={() => setRecentScan(null)} onUndo={undoScan} />}

        <Button
          disabled={!task.slot_scanned || !task.old_bin_scanned}
          onClick={complete}
          data-testid={`submit-replacement-completed-btn-${task.id}`}
          className="w-full bg-beet hover:bg-beet-hover text-bone"
        >
          Submit Replacement Completed
        </Button>
      </CardContent>
    </Card>
  );
}

export default function BinReplacementTasks() {
  const [params] = useSearchParams();
  const { options } = useAssignedMachines();
  const [machineId, setMachineId] = useState(params.get("machine") || "");
  const [tasks, setTasks] = useState([]);

  useEffect(() => { if (options.length && !machineId) setMachineId(options[0].value); }, [options, machineId]);

  const load = useCallback(() => {
    if (!machineId) return;
    api.get(`/operations/bin-replacement-tasks?machine_id=${machineId}`).then(({ data }) => setTasks(data));
  }, [machineId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="bin-replacement-tasks-page">
      <PageHeader title="Bin Replacement Tasks" description="Remove the old bin, place the new bin, and return the old bin as dirty" />
      <div className="max-w-md mb-4">
        <SearchableSelect options={options} value={machineId} onChange={setMachineId} testId="bin-replacement-machine-select" />
      </div>
      <div className="space-y-4">
        {tasks.length === 0 && <p className="text-sm text-ink/60" data-testid="bin-replacement-tasks-empty">No active bin replacement tasks for this machine.</p>}
        {tasks.map((t) => <TaskCard key={t.id} task={t} onRefresh={load} />)}
      </div>
    </div>
  );
}
