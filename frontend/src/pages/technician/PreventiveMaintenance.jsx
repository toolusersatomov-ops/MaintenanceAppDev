import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";

export default function TechPreventiveMaintenance() {
  const [items, setItems] = useState([]);
  const { toast } = useToast();
  const load = () => api.get("/maintenance/preventive").then(({ data }) => setItems(data));
  useEffect(() => { load(); }, []);

  const complete = async (id) => {
    await api.post(`/maintenance/preventive/${id}/complete`);
    toast({ title: "Preventive maintenance marked complete" });
    load();
  };

  return (
    <div data-testid="preventive-maintenance-page">
      <PageHeader title="Preventive Maintenance" description="Scheduled preventive maintenance checklists" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((pm) => (
          <Card key={pm.id} className="bg-oat border-clay/40" data-testid={`pm-card-${pm.id}`}>
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between items-center">
                <p className="font-semibold text-ink">{pm.machine_label}</p>
                <StatusBadge status={pm.status} />
              </div>
              <p className="text-xs text-ink/60 font-mono">Next Due: {new Date(pm.next_due_date).toLocaleDateString()}</p>
              <ul className="text-sm list-disc pl-5 text-ink/80">
                {pm.checklist.map((c) => <li key={c}>{c}</li>)}
              </ul>
              <Button size="sm" onClick={() => complete(pm.id)} data-testid={`complete-pm-btn-${pm.id}`} className="bg-beet hover:bg-beet-hover text-bone">
                Mark Complete
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
