import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import QRScanSim from "@/components/shared/QRScanSim";
import RecentScanPanel from "@/components/shared/RecentScanPanel";
import useAssignedMachines from "@/hooks/useAssignedMachines";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function PickupList() {
  const [params] = useSearchParams();
  const { options } = useAssignedMachines();
  const [machineId, setMachineId] = useState(params.get("machine") || "");
  const [items, setItems] = useState([]);
  const [recentScan, setRecentScan] = useState(null);
  const { toast } = useToast();

  useEffect(() => { if (options.length && !machineId) setMachineId(options[0].value); }, [options, machineId]);

  const load = useCallback(() => {
    if (!machineId) return;
    api.get(`/operations/pickup-list?machine_id=${machineId}`).then(({ data }) => setItems(data));
  }, [machineId]);

  useEffect(() => { load(); }, [load]);

  const scannable = items.filter((i) => i.status === "Ready for Pickup").map((i) => ({ qr_code_id: i.qr_code_id, label: i.ingredient_name, sublabel: i.bin_id }));
  const pickedCount = items.filter((i) => i.status === "Picked").length;
  const scheduled = items.filter((i) => ["Ready for Pickup", "Picked"].includes(i.status));
  const allPicked = scheduled.length > 0 && scheduled.every((i) => i.status === "Picked");

  const handleScan = async (qr_code_id) => {
    try {
      const { data } = await api.post("/operations/pickup-list/scan", { machine_id: machineId, qr_code_id });
      toast({ title: data.message });
      if (data.scan_action_id) {
        setRecentScan({ id: data.scan_action_id, qr_code_id, affected_record_type: "pickup_task", status_before: "Ready for Pickup", status_after: "Picked", scanned_by: "you", scanned_at: new Date().toISOString() });
      }
      load();
    } catch (e) {
      toast({ title: "Scan failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const markAll = async () => {
    try {
      const { data } = await api.post("/operations/pickup-list/mark-all", { machine_id: machineId });
      toast({ title: data.message });
      load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const undoScan = async (id, comment) => {
    await api.post(`/operations/scan-actions/${id}/undo`, { comment });
    setRecentScan(null);
    toast({ title: "Scan undone and correction logged" });
    load();
  };

  return (
    <div data-testid="pickup-list-page">
      <PageHeader title="Pickup List" description="Scan bin QR codes to mark items as Picked" />
      <div className="max-w-md mb-4">
        <SearchableSelect options={options} value={machineId} onChange={setMachineId} testId="pickup-list-machine-select" />
      </div>

      <p className="font-mono text-sm mb-3" data-testid="pickup-counter">Picked: {pickedCount} / {scheduled.length}</p>

      <div className="mb-4">
        <QRScanSim options={scannable} onScan={handleScan} testId="pickup-scan-btn" emptyText="No items currently Ready for Pickup." />
      </div>

      {recentScan && (
        <div className="mb-4">
          <RecentScanPanel scan={recentScan} onConfirm={() => setRecentScan(null)} onUndo={undoScan} />
        </div>
      )}

      <div className="space-y-2 mb-4">
        {(() => {
          const bulkGroups = {};
          const singles = [];
          items.forEach((i) => {
            if (i.bulk_order_id) {
              bulkGroups[i.bulk_order_id] = bulkGroups[i.bulk_order_id] || [];
              bulkGroups[i.bulk_order_id].push(i);
            } else {
              singles.push(i);
            }
          });
          const renderCard = (i) => (
            <Card key={i.id} className="bg-oat border-clay/40" data-testid={`pickup-item-${i.id}`}>
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm text-ink">{i.ingredient_name}</p>
                  <p className="text-xs text-ink/60 font-mono">{i.bin_id || "Awaiting Kitchen"}</p>
                </div>
                <StatusBadge status={i.status} />
              </CardContent>
            </Card>
          );
          return (
            <>
              {Object.entries(bulkGroups).map(([bulkId, group]) => (
                <div key={bulkId} className="border border-beet/40 rounded-lg p-3 bg-beet/5 mb-2" data-testid={`pickup-bulk-group-${bulkId}`}>
                  <p className="text-xs font-mono text-beet font-semibold mb-2">Bulk Order &middot; {group.length} item(s) &middot; {bulkId.slice(0, 8)}</p>
                  <div className="space-y-2">{group.map(renderCard)}</div>
                </div>
              ))}
              {singles.map(renderCard)}
            </>
          );
        })()}
        {items.length === 0 && <p className="text-sm text-ink/60" data-testid="pickup-list-empty">No pickup items for this machine.</p>}
      </div>

      <Button disabled={!allPicked} onClick={markAll} data-testid="mark-all-picked-btn" className="w-full py-4 text-base font-bold bg-beet hover:bg-beet-hover text-bone">
        Mark All Scheduled Items Picked
      </Button>
    </div>
  );
}
