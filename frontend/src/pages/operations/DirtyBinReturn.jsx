import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import QRScanSim from "@/components/shared/QRScanSim";
import RecentScanPanel from "@/components/shared/RecentScanPanel";
import useAssignedMachines from "@/hooks/useAssignedMachines";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function DirtyBinReturn() {
  const [params] = useSearchParams();
  const { options } = useAssignedMachines();
  const [machineId, setMachineId] = useState(params.get("machine") || "");
  const [items, setItems] = useState([]);
  const [recentScan, setRecentScan] = useState(null);
  const { toast } = useToast();

  useEffect(() => { if (options.length && !machineId) setMachineId(options[0].value); }, [options, machineId]);

  const load = useCallback(() => {
    if (!machineId) return;
    api.get(`/operations/dirty-bin-return?machine_id=${machineId}`).then(({ data }) => setItems(data));
  }, [machineId]);
  useEffect(() => { load(); }, [load]);

  const handleScan = async (qr_code_id) => {
    try {
      const { data } = await api.post("/operations/dirty-bin-return/scan", { machine_id: machineId, qr_code_id });
      toast({ title: data.message });
      if (data.scan_action_id) {
        setRecentScan({ id: data.scan_action_id, qr_code_id, affected_record_type: "dirty_bin_return", status_before: "Dirty / Returned from Machine", status_after: "Returned to Kitchen", scanned_by: "you", scanned_at: new Date().toISOString() });
      }
      load();
    } catch (e) {
      toast({ title: "Scan failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const undoScan = async (id, comment) => {
    await api.post(`/operations/scan-actions/${id}/undo`, { comment });
    setRecentScan(null);
    load();
  };

  return (
    <div data-testid="dirty-bin-return-page">
      <PageHeader title="Dirty Bin Return" description="Scan dirty bins to confirm they are returned to Kitchen for cleaning" />
      <div className="max-w-md mb-4">
        <SearchableSelect options={options} value={machineId} onChange={setMachineId} testId="dirty-bin-return-machine-select" />
      </div>

      <div className="mb-4">
        <QRScanSim
          options={items.map((i) => ({ qr_code_id: i.qr_code_id, label: i.ingredient_name, sublabel: i.bin_id }))}
          onScan={handleScan}
          triggerLabel="Scan Dirty Bin QR to Mark Returned"
          testId="dirty-bin-return-scan-btn"
          emptyText="No dirty bins pending return for this machine."
        />
      </div>

      {recentScan && <div className="mb-4"><RecentScanPanel scan={recentScan} onConfirm={() => setRecentScan(null)} onUndo={undoScan} /></div>}

      <div className="space-y-2">
        {items.map((i) => (
          <Card key={i.id} className="bg-oat border-clay/40" data-testid={`dirty-bin-item-${i.id}`}>
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm text-ink">{i.ingredient_name} &middot; {i.bin_id}</p>
                <p className="text-xs text-ink/60 font-mono">{new Date(i.returned_at).toLocaleString()}</p>
              </div>
              <StatusBadge status={i.status} />
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && <p className="text-sm text-ink/60" data-testid="dirty-bin-return-empty">No pending dirty bins.</p>}
      </div>
    </div>
  );
}
