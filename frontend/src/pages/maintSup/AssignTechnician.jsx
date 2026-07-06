import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";

export default function AssignTechnician() {
  const [wos, setWos] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [selection, setSelection] = useState({});
  const { toast } = useToast();

  const load = () => api.get("/maintenance/work-orders?status=Open").then(({ data }) => setWos(data));
  useEffect(() => {
    load();
    api.get("/maintenance/technicians").then(({ data }) => setTechnicians(data.map((t) => ({ value: t.username, label: `${t.name} (${t.username})` }))));
  }, []);

  const assign = async (id) => {
    await api.post(`/maintenance/work-orders/${id}/assign`, { technician: selection[id] });
    toast({ title: `Assigned to ${selection[id]}` });
    load();
  };

  return (
    <div data-testid="assign-technician-page">
      <PageHeader title="Assign Technician" description="Unassigned work orders waiting for a technician" />
      <div className="space-y-3">
        {wos.map((wo) => (
          <Card key={wo.id} className="bg-oat border-clay/40" data-testid={`assign-tech-wo-${wo.id}`}>
            <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-sm text-ink">{wo.title}</p>
                <p className="text-xs text-ink/60 font-mono">{wo.machine_label} &middot; Priority: {wo.priority}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={wo.status} />
                <div className="w-56"><SearchableSelect options={technicians} value={selection[wo.id] || ""} onChange={(v) => setSelection({ ...selection, [wo.id]: v })} placeholder="Select Technician" testId={`assign-tech-select-${wo.id}`} /></div>
                <Button size="sm" disabled={!selection[wo.id]} onClick={() => assign(wo.id)} data-testid={`assign-tech-btn-${wo.id}`} className="bg-beet hover:bg-beet-hover text-bone">Assign</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {wos.length === 0 && <p className="text-sm text-ink/60" data-testid="assign-technician-empty">No unassigned work orders.</p>}
      </div>
    </div>
  );
}
