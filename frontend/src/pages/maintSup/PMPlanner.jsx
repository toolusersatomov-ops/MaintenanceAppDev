import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function PMPlanner() {
  const [items, setItems] = useState([]);
  const [machines, setMachines] = useState([]);
  const [machineId, setMachineId] = useState("");
  const [frequency, setFrequency] = useState(90);
  const [dueDate, setDueDate] = useState("");
  const { toast } = useToast();

  const load = () => api.get("/maintenance/preventive").then(({ data }) => setItems(data));
  useEffect(() => {
    load();
    api.get("/catalog/machines").then(({ data }) => setMachines(data));
  }, []);

  const create = async () => {
    try {
      await api.post("/maintenance/preventive", { machine_id: machineId, frequency_days: frequency, next_due_date: new Date(dueDate).toISOString() });
      toast({ title: "Preventive maintenance scheduled" });
      setMachineId(""); setDueDate("");
      load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  return (
    <div data-testid="pm-planner-page">
      <PageHeader title="Preventive Maintenance Planner" description="Schedule and track preventive maintenance across all machines" />
      <Card className="bg-oat border-clay/40 mb-6">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <SearchableSelect options={machines.map((m) => ({ value: m.id, label: m.label }))} value={machineId} onChange={setMachineId} placeholder="Machine" testId="pm-planner-machine-select" />
          <Input type="number" placeholder="Frequency (days)" value={frequency} onChange={(e) => setFrequency(Number(e.target.value))} className="bg-bone" data-testid="pm-planner-frequency" />
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-bone" data-testid="pm-planner-due-date" />
          <Button onClick={create} disabled={!machineId || !dueDate} data-testid="pm-planner-submit-btn" className="bg-beet hover:bg-beet-hover text-bone">Schedule PM</Button>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((pm) => (
          <Card key={pm.id} className="bg-oat border-clay/40" data-testid={`pm-planner-card-${pm.id}`}>
            <CardContent className="p-4">
              <div className="flex justify-between items-center mb-1">
                <p className="font-semibold text-ink">{pm.machine_label}</p>
                <StatusBadge status={pm.status} />
              </div>
              <p className="text-xs text-ink/60 font-mono">Next Due: {new Date(pm.next_due_date).toLocaleDateString()}</p>
              <p className="text-xs text-ink/60 font-mono">Frequency: every {pm.frequency_days} days</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
