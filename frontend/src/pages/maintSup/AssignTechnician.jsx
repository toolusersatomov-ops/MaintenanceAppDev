import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import WorkOrderRows from "@/components/maint/WorkOrderRows";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function AssignTechnician() {
  const [orders, setOrders] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tech, setTech] = useState("");
  const { toast } = useToast();

  const load = useCallback(() => {
    api.get("/maintenance/work-orders?active=true").then(({ data }) => setOrders(data));
    api.get("/maintenance/technicians").then(({ data }) => setTechnicians(data));
  }, []);
  useEffect(() => { load(); }, [load]);

  const assign = async () => {
    try {
      const { data } = await api.post(`/maintenance-sup/work-orders/${selected.id}/assign`, { technician: tech || null });
      toast({ title: data.message });
      setSelected(null); setTech(""); load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  return (
    <div data-testid="assign-technician-page">
      <PageHeader title="Assign Technician" description="Assign or reassign active work orders, balanced against live technician workload" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {technicians.map((t) => (
          <Card key={t.username} className="bg-oat border-clay/40" data-testid={`technician-card-${t.username}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">{t.name} <span className="font-mono text-xs text-ink/60">({t.username})</span></p>
                <StatusBadge status={t.availability} />
              </div>
              <p className="text-xs text-ink/70 mt-1">
                {t.active_work_orders} active &middot; {t.critical_tasks} high/critical &middot; {t.waiting_for_parts} waiting for parts &middot; {t.overdue_tasks} overdue
              </p>
              <p className="text-xs text-ink/50 mt-1">{t.current_task || "No task in progress"}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <WorkOrderRows orders={orders} selectedId={selected?.id} onSelect={setSelected} emptyText="No active work orders." />
        {selected && (
          <Card className="bg-oat border-clay/40 h-fit" data-testid="assign-panel">
            <CardContent className="p-5 space-y-3">
              <p className="font-display font-bold text-ink">{selected.wo_id} &middot; {selected.issue_type}</p>
              <p className="text-sm text-ink/70">{selected.machine_label} &middot; {selected.priority} &middot; currently {selected.assigned_technician || "unassigned"}</p>
              <SearchableSelect options={[{ value: "", label: "Auto-assign lowest workload" },
                                           ...technicians.map((t) => ({ value: t.username, label: `${t.name} (${t.username}) \u00b7 ${t.active_work_orders} active \u00b7 ${t.availability}` }))]}
                                 value={tech} onChange={setTech} placeholder="Select technician" testId="assign-technician-select" />
              <Button onClick={assign} data-testid="assign-technician-btn" className="bg-beet hover:bg-beet-hover text-bone">Assign Technician</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
