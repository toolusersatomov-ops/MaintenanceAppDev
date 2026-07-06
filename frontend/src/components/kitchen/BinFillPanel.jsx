import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import QRScanSim from "@/components/shared/QRScanSim";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function BinFillPanel({ request, onDone }) {
  const [binOptions, setBinOptions] = useState([]);
  const [scanned, setScanned] = useState(null);
  const [cleanConfirmed, setCleanConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    api.get(`/kitchen/preparation-requests/${request.id}/bin-options`).then(({ data }) => {
      setBinOptions(data.map((b) => ({ qr_code_id: b.qr_code_id, label: `${b.bin_type} Bin \u2013 ${b.id}`, sublabel: b.status, _bin: b })));
    });
  }, [request.id]);

  const handleScan = async (qr_code_id) => {
    const opt = binOptions.find((o) => o.qr_code_id === qr_code_id);
    if (!opt) return;
    try {
      const { data } = await api.post(`/kitchen/preparation-requests/${request.id}/scan-bin`, { bin_id: opt._bin.id });
      setScanned({ ...data, bin_id: opt._bin.id });
      toast({ title: "Bin QR scanned", description: `${data.bin_type} bin recognized \u2013 details auto-filled` });
    } catch (e) {
      toast({ title: "Scan failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post(`/kitchen/preparation-requests/${request.id}/save-bin`, {
        bin_id: scanned.bin_id, quantity: scanned.quantity, unit: scanned.unit,
        expiry_date: scanned.expiry_date, replacement_due_date: scanned.replacement_due_date,
        clean_confirmed: cleanConfirmed,
      });
      toast({ title: "Bin saved", description: "Status: Saved / Ready for Pickup" });
      onDone && onDone();
    } catch (e) {
      toast({ title: "Save failed", description: formatApiError(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-bone border-clay/40 mt-3" data-testid={`bin-fill-panel-${request.id}`}>
      <CardContent className="p-4 space-y-4">
        <div className="text-sm">
          <p className="font-semibold text-ink">{request.ingredient_name} for {request.machine_label}</p>
          <p className="font-mono text-ink/70">Required Quantity: {request.quantity} {request.unit} (read-only, auto-calculated)</p>
        </div>

        {!scanned ? (
          <QRScanSim
            options={binOptions}
            onScan={handleScan}
            triggerLabel="Open Camera / Scan Bin QR"
            testId={`scan-bin-btn-${request.id}`}
            emptyText="No Clean / Ready for Filling bins available for this category."
          />
        ) : (
          <div className="space-y-3" data-testid={`bin-fill-details-${request.id}`}>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-oat rounded-md p-3 border border-clay/30">
              <div><span className="text-ink/60">Bin ID:</span> {scanned.bin_id}</div>
              <div><span className="text-ink/60">QR Code:</span> {scanned.qr_code_id}</div>
              <div><span className="text-ink/60">Bin Type:</span> {scanned.bin_type}</div>
              <div><span className="text-ink/60">Slot Type:</span> {scanned.slot_type}</div>
              <div><span className="text-ink/60">Bin Status:</span> {scanned.current_bin_status}</div>
              <div><span className="text-ink/60">Previous Ingredient:</span> {scanned.previous_ingredient || "None"}</div>
              <div><span className="text-ink/60">Last Used Machine:</span> {scanned.last_used_machine || "N/A"}</div>
              <div><span className="text-ink/60">Last Cleaned:</span> {new Date(scanned.last_cleaned_date).toLocaleDateString()}</div>
              <div><span className="text-ink/60">Quantity:</span> {scanned.quantity} {scanned.unit}</div>
              <div><span className="text-ink/60">Expiry Date:</span> {new Date(scanned.expiry_date).toLocaleDateString()}</div>
              <div><span className="text-ink/60">Replacement Due:</span> {new Date(scanned.replacement_due_date).toLocaleDateString()}</div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id={`clean-${request.id}`} checked={cleanConfirmed} onCheckedChange={setCleanConfirmed} data-testid={`clean-confirm-checkbox-${request.id}`} />
              <label htmlFor={`clean-${request.id}`} className="text-sm text-ink">I confirm the bin is clean and ready for filling.</label>
            </div>
            <Button disabled={!cleanConfirmed || saving} onClick={handleSave} data-testid={`save-bin-btn-${request.id}`} className="bg-beet hover:bg-beet-hover text-bone">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Save Bin Details
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
