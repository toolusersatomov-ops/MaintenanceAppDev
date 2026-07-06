import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import StatusBadge from "@/components/shared/StatusBadge";
import QRScanSim from "@/components/shared/QRScanSim";
import { nextStage } from "@/constants/workOrderStages";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function WorkOrderCard({ wo, onRefresh }) {
  const [partOpen, setPartOpen] = useState(false);
  const [partName, setPartName] = useState("");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const { toast } = useToast();

  const accept = async () => {
    await api.post(`/maintenance/work-orders/${wo.id}/accept`);
    toast({ title: "Work order accepted" });
    onRefresh();
  };

  const advance = async (to) => {
    try {
      await api.post(`/maintenance/work-orders/${wo.id}/advance`, { to_stage: to });
      toast({ title: `Advanced to ${to}` });
      onRefresh();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const requestPart = async () => {
    try {
      await api.post("/maintenance/spare-parts-requests", { work_order_id: wo.id, machine_id: wo.machine_id, part_name: partName, quantity: qty, reason });
      toast({ title: "Spare part request sent to Supervisor" });
      setPartOpen(false); setPartName(""); setReason("");
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const next = nextStage(wo.stage);

  return (
    <Card className="bg-oat border-clay/40" data-testid={`work-order-card-${wo.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="font-semibold text-ink">{wo.title}</p>
            <p className="text-xs text-ink/60 font-mono">{wo.machine_label} &middot; {wo.type} &middot; Priority: {wo.priority}</p>
          </div>
          <StatusBadge status={wo.stage || wo.status} />
        </div>

        <div className="flex flex-wrap gap-2">
          {wo.status === "Assigned" || wo.status === "Open" ? (
            <Button onClick={accept} data-testid={`accept-wo-btn-${wo.id}`} className="bg-beet hover:bg-beet-hover text-bone">Accept Work Order</Button>
          ) : wo.stage === "Machine QR Scanned" || wo.stage === "Reached Machine" ? null : null}

          {wo.status !== "Assigned" && wo.status !== "Open" && wo.status !== "Closed" && wo.status !== "Pending Review" && next && wo.stage !== "Reached Machine" && (
            <Button variant="outline" onClick={() => advance(next)} data-testid={`advance-wo-btn-${wo.id}`}>Advance to "{next}"</Button>
          )}

          {wo.stage === "Reached Machine" && (
            <QRScanSim
              options={[{ qr_code_id: `MACHINEQR-${wo.machine_id}`, label: `Machine QR \u2013 ${wo.machine_label}`, sublabel: wo.machine_id }]}
              onScan={() => advance("Machine QR Scanned")}
              large={false}
              triggerLabel="Scan Machine QR"
              testId={`scan-machine-qr-btn-${wo.id}`}
            />
          )}

          {wo.status !== "Closed" && wo.status !== "Open" && wo.status !== "Assigned" && (
            <Button variant="ghost" onClick={() => setPartOpen(true)} data-testid={`request-spare-part-btn-${wo.id}`}>Request Spare Part</Button>
          )}
        </div>

        <Dialog open={partOpen} onOpenChange={setPartOpen}>
          <DialogContent className="bg-bone" data-testid={`spare-part-dialog-${wo.id}`}>
            <DialogHeader><DialogTitle>Request Spare Part</DialogTitle></DialogHeader>
            <Input placeholder="Part Name" value={partName} onChange={(e) => setPartName(e.target.value)} className="bg-bone" data-testid="spare-part-name-input" />
            <Input type="number" min={1} placeholder="Quantity" value={qty} onChange={(e) => setQty(Number(e.target.value))} className="bg-bone" data-testid="spare-part-qty-input" />
            <Textarea placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className="bg-bone" data-testid="spare-part-reason-input" />
            <Button onClick={requestPart} disabled={!partName || !reason} data-testid="spare-part-submit-btn" className="bg-beet hover:bg-beet-hover text-bone">Submit Request</Button>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
