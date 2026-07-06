import React, { useEffect, useState } from "react";
import { Truck, Recycle, Sparkles } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import KPICard from "@/components/shared/KPICard";
import useAssignedMachines from "@/hooks/useAssignedMachines";

export default function OpsDashboard() {
  const { machines } = useAssignedMachines();
  const [totals, setTotals] = useState({ pickup: 0, replacement: 0, cleaningPending: 0 });

  useEffect(() => {
    if (!machines.length) return;
    setTotals({
      pickup: machines.reduce((s, m) => s + m.pending_pickup_count, 0),
      replacement: machines.reduce((s, m) => s + m.pending_bin_replacement_count, 0),
      cleaningPending: machines.filter((m) => m.cleaning_status !== "Completed").length,
    });
  }, [machines]);

  return (
    <div data-testid="operations-dashboard-page">
      <PageHeader title="Operations Staff Dashboard" description="Your assigned machines and pending tasks" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard label="Assigned Machines" value={machines.length} />
        <KPICard label="Pending Pickups" value={totals.pickup} icon={Truck} accent />
        <KPICard label="Pending Bin Replacements" value={totals.replacement} icon={Recycle} />
        <KPICard label="Cleaning Pending" value={totals.cleaningPending} icon={Sparkles} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {machines.map((m) => (
          <div key={m.id} className="bg-oat border border-clay/40 rounded-lg p-4" data-testid={`ops-dashboard-machine-${m.id}`}>
            <p className="font-semibold text-ink">{m.label}</p>
            <p className="text-xs text-ink/60 font-mono">Status: {m.status} &middot; Trolley: {m.trolley_status}</p>
            <p className="text-xs font-mono mt-1">Pickup: {m.pending_pickup_count} &middot; Replacement: {m.pending_bin_replacement_count}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
