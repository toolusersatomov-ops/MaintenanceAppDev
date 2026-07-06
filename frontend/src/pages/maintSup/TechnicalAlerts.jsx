import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function TechnicalAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [dialogAlert, setDialogAlert] = useState(null);
  const [technician, setTechnician] = useState("");
  const { toast } = useToast();

  const load = () => api.get("/maintenance/technical-alerts").then(({ data }) => setAlerts(data));
  useEffect(() => {
    load();
    api.get("/maintenance/technicians").then(({ data }) => setTechnicians(data.map((t) => ({ value: t.username, label: `${t.name} (${t.username})` }))));
  }, []);

  const createWorkOrder = async () => {
    try {
      await api.post(`/maintenance/technical-alerts/${dialogAlert.id}/create-work-order`, { technician, priority: dialogAlert.severity });
      toast({ title: "Work order created" });
      setDialogAlert(null);
      setTechnician("");
      load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  return (
    <div data-testid="technical-alerts-page">
      <PageHeader title="Technical Alerts" description="Machine issues detected that may need a work order" />
      <div className="space-y-2">
        {alerts.map((a) => (
          <Card key={a.id} className="bg-oat border-clay/40" data-testid={`technical-alert-${a.id}`}>
            <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-sm text-ink">{a.title}</p>
                <p className="text-xs text-ink/60 font-mono">{a.machine_label} &middot; Severity: {a.severity}</p>
                <p className="text-xs text-ink/70 mt-1">{a.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={a.status} />
                {a.status === "Open" && (
                  <Button size="sm" onClick={() => setDialogAlert(a)} data-testid={`create-wo-from-alert-${a.id}`} className="bg-beet hover:bg-beet-hover text-bone">
                    Create Work Order
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {alerts.length === 0 && <p className="text-sm text-ink/60" data-testid="technical-alerts-empty">No technical alerts.</p>}
      </div>

      <Dialog open={!!dialogAlert} onOpenChange={(v) => !v && setDialogAlert(null)}>
        <DialogContent className="bg-bone" data-testid="create-wo-dialog">
          <DialogHeader><DialogTitle>Create Work Order: {dialogAlert?.title}</DialogTitle></DialogHeader>
          <SearchableSelect options={technicians} value={technician} onChange={setTechnician} placeholder="Assign Technician" testId="create-wo-technician-select" />
          <Button onClick={createWorkOrder} data-testid="create-wo-submit-btn" className="bg-beet hover:bg-beet-hover text-bone">Create Work Order</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
