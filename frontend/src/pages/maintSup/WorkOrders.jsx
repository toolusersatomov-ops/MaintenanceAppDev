import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function MSWorkOrders() {
  const [wos, setWos] = useState([]);
  const [machines, setMachines] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ machine_id: "", type: "Breakdown", title: "", priority: "Medium", technician: "" });
  const { toast } = useToast();

  const load = () => api.get("/maintenance/work-orders").then(({ data }) => setWos(data));
  useEffect(() => {
    load();
    api.get("/catalog/machines").then(({ data }) => setMachines(data));
    api.get("/maintenance/technicians").then(({ data }) => setTechnicians(data.map((t) => ({ value: t.username, label: `${t.name} (${t.username})` }))));
  }, []);

  const createWO = async () => {
    try {
      await api.post("/maintenance/work-orders", form);
      toast({ title: "Work order created" });
      setCreateOpen(false);
      setForm({ machine_id: "", type: "Breakdown", title: "", priority: "Medium", technician: "" });
      load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const review = async (id, decision) => {
    try {
      await api.post(`/maintenance/work-orders/${id}/review`, { decision });
      toast({ title: `Work order ${decision === "approve" ? "closed" : "reopened"}` });
      load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  return (
    <div data-testid="ms-work-orders-page">
      <PageHeader
        title="Work Orders"
        description="All maintenance work orders across the fleet"
        actions={<Button onClick={() => setCreateOpen(true)} data-testid="create-work-order-btn" className="bg-beet hover:bg-beet-hover text-bone">New Work Order</Button>}
      />
      <div className="space-y-2">
        {wos.map((wo) => (
          <Card key={wo.id} className="bg-oat border-clay/40" data-testid={`ms-work-order-${wo.id}`}>
            <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-sm text-ink">{wo.title}</p>
                <p className="text-xs text-ink/60 font-mono">{wo.machine_label} &middot; {wo.type} &middot; Tech: {wo.assigned_technician || "Unassigned"}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={wo.stage || wo.status} />
                {wo.status === "Pending Review" && (
                  <>
                    <Button size="sm" onClick={() => review(wo.id, "approve")} data-testid={`approve-wo-${wo.id}`} className="bg-beet hover:bg-beet-hover text-bone">Approve & Close</Button>
                    <Button size="sm" variant="outline" onClick={() => review(wo.id, "reopen")} data-testid={`reopen-wo-${wo.id}`}>Reopen</Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {wos.length === 0 && <p className="text-sm text-ink/60" data-testid="ms-work-orders-empty">No work orders yet.</p>}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-bone" data-testid="create-wo-full-dialog">
          <DialogHeader><DialogTitle>New Work Order</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <SearchableSelect options={machines.map((m) => ({ value: m.id, label: m.label }))} value={form.machine_id} onChange={(v) => setForm({ ...form, machine_id: v })} placeholder="Select Machine" testId="new-wo-machine-select" />
            <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-bone" data-testid="new-wo-title" />
            <SearchableSelect options={[{ value: "Breakdown", label: "Breakdown" }, { value: "Preventive Maintenance", label: "Preventive Maintenance" }, { value: "Calibration", label: "Calibration" }]} value={form.type} onChange={(v) => setForm({ ...form, type: v })} testId="new-wo-type-select" />
            <SearchableSelect options={technicians} value={form.technician} onChange={(v) => setForm({ ...form, technician: v })} placeholder="Assign Technician (optional)" testId="new-wo-technician-select" />
            <Button onClick={createWO} disabled={!form.machine_id || !form.title} data-testid="new-wo-submit-btn" className="w-full bg-beet hover:bg-beet-hover text-bone">Create Work Order</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
