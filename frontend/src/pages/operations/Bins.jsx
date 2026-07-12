import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import useAssignedMachines from "@/hooks/useAssignedMachines";
import api from "@/lib/api";

function LevelBar({ pct, status }) {
  const color = status === "Low Stock" ? "bg-red-500" : status === "Near Expiry" ? "bg-amber-500" : status === "Replacement Due" ? "bg-orange-500" : "bg-green-600";
  return (
    <div className="w-full h-2 rounded-full bg-stone/50 overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

export default function Bins() {
  const [params] = useSearchParams();
  const { options } = useAssignedMachines();
  const [machineId, setMachineId] = useState(params.get("machine") || "");
  const [slots, setSlots] = useState([]);

  useEffect(() => { if (options.length && !machineId) setMachineId(options[0].value); }, [options, machineId]);

  const load = useCallback(() => {
    if (!machineId) return;
    api.get(`/operations/bins?machine_id=${machineId}`).then(({ data }) => setSlots(data));
  }, [machineId]);
  useEffect(() => { load(); }, [load]);

  const categories = ["Liquid", "Powder", "Solid", "Other"];

  return (
    <div data-testid="bins-page">
      <PageHeader title="Machine Bin Status" description="Solid, liquid, powder bins and consumable levels for the selected machine" />
      <div className="max-w-md mb-6">
        <SearchableSelect options={options} value={machineId} onChange={setMachineId} testId="bins-machine-select" />
      </div>
      {categories.map((cat) => (
        <div key={cat} className="mb-6">
          <h3 className="font-display font-semibold text-ink mb-2">{cat}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {slots.filter((s) => s.slot_type === cat).map((s) => (
              <div key={s.id} className="bg-oat border border-clay/40 rounded-lg p-3" data-testid={`bin-slot-${s.id}`}>
                <div className="flex justify-between items-start mb-1">
                  <p className="text-sm font-semibold text-ink truncate">{s.ingredient_name}</p>
                  <StatusBadge status={s.status} />
                </div>
                <LevelBar pct={s.current_level_pct} status={s.status} />
                <p className="text-xs font-mono text-ink/60 mt-1">{s.current_quantity} / {s.capacity} {s.unit} ({s.current_level_pct}%)</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
