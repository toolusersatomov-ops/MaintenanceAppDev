import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import api from "@/lib/api";

function LevelBar({ pct, status }) {
  const color = status === "Low Stock" ? "bg-red-500" : status === "Near Expiry" ? "bg-amber-500" : status === "Replacement Due" ? "bg-orange-500" : "bg-green-600";
  return (
    <div className="w-full h-2 rounded-full bg-stone/50 overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

export default function MachineControlCenter() {
  const navigate = useNavigate();
  const [machines, setMachines] = useState([]);
  const [machineId, setMachineId] = useState("");
  const [data, setData] = useState({ grouped: { Liquid: [], Powder: [], Solid: [], Other: [] } });

  useEffect(() => {
    api.get("/catalog/machines").then(({ data }) => { setMachines(data); if (data.length) setMachineId(data[0].id); });
  }, []);

  const load = useCallback(() => {
    if (!machineId) return;
    api.get(`/catalog/machines/${machineId}/slots`).then(({ data }) => setData(data));
  }, [machineId]);
  useEffect(() => { load(); }, [load]);

  const machine = machines.find((m) => m.id === machineId);
  const openSlotAlert = async (slot) => {
    if (slot.status === "Normal") return;
    const { data } = await api.post("/alerts/ensure", { machine_id: machineId, slot_id: slot.id });
    navigate(`/supervisor/alert/${data.id}`);
  };

  return (
    <div data-testid="machine-control-center-page">
      <PageHeader title="Machine Control Center" description="Live view of every slot in the selected machine" />
      <div className="max-w-md mb-4">
        <SearchableSelect
          options={machines.map((m) => ({ value: m.id, label: m.label }))}
          value={machineId} onChange={setMachineId} testId="mcc-machine-select"
        />
      </div>
      {machine && (
        <div className="flex items-center gap-3 mb-6" data-testid="mcc-machine-details">
          <p className="font-display font-bold text-lg text-ink">{machine.label}</p>
          <StatusBadge status={machine.status} />
          <span className="text-xs text-ink/60 font-mono">Assigned: {machine.assigned_operations_staff}</span>
        </div>
      )}
      {["Liquid", "Powder", "Solid", "Other"].map((cat) => (
        <div key={cat} className="mb-6">
          <h3 className="font-display font-semibold text-ink mb-2">{cat}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(data.grouped[cat] || []).map((s) => (
              <button
                key={s.id}
                onClick={() => openSlotAlert(s)}
                data-testid={`mcc-slot-${s.id}`}
                className={`text-left bg-oat border rounded-lg p-3 transition-colors ${s.status !== "Normal" ? "border-beet/60 hover:bg-stone/40 cursor-pointer" : "border-clay/40 cursor-default"}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <p className="text-sm font-semibold text-ink truncate">{s.ingredient_name}</p>
                  <StatusBadge status={s.status} />
                </div>
                <LevelBar pct={s.current_level_pct} status={s.status} />
                <p className="text-xs font-mono text-ink/60 mt-1">{s.current_quantity} / {s.capacity} {s.unit} ({s.current_level_pct}%)</p>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
