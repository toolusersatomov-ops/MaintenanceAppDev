import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DoorOpen, Truck, Recycle, Sparkles, Warehouse, History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import useAssignedMachines from "@/hooks/useAssignedMachines";

const ACTIONS = [
  { key: "door-control", label: "Door Control", icon: DoorOpen, path: "/operations/door-control" },
  { key: "pickup-list", label: "Pickup List", icon: Truck, path: "/operations/pickup-list" },
  { key: "bin-replacement-tasks", label: "Bin Replacement Tasks", icon: Recycle, path: "/operations/bin-replacement-tasks" },
  { key: "cleaning", label: "Cleaning & Sanitization", icon: Sparkles, path: "/operations/cleaning" },
  { key: "bins", label: "Bins", icon: Warehouse, path: "/operations/bins" },
  { key: "dirty-bin-return", label: "Dirty Bin Return", icon: Recycle, path: "/operations/dirty-bin-return" },
  { key: "replacement-history", label: "Replacement History", icon: History, path: "/operations/replacement-history" },
];

export default function AssignedMachines() {
  const { machines, options } = useAssignedMachines();
  const [selected, setSelected] = useState("");
  const navigate = useNavigate();

  useEffect(() => { if (options.length && !selected) setSelected(options[0].value); }, [options, selected]);

  const machine = machines.find((m) => m.id === selected);

  return (
    <div data-testid="assigned-machines-page">
      <PageHeader title="Assigned Machines" description="Select a machine to view tasks and take action" />

      <div className="max-w-md mb-6">
        <SearchableSelect options={options} value={selected} onChange={setSelected} placeholder="Select Machine" testId="assigned-machine-select" />
      </div>

      {machine && (
        <>
          <Card className="bg-oat border-clay/40 mb-6" data-testid="assigned-machine-summary">
            <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div><p className="text-ink/60 text-xs">Machine</p><p className="font-semibold">{machine.label}</p></div>
              <div><p className="text-ink/60 text-xs">Status</p><StatusBadge status={machine.status} /></div>
              <div><p className="text-ink/60 text-xs">Assigned Tasks</p><p className="font-mono">{machine.assigned_tasks}</p></div>
              <div><p className="text-ink/60 text-xs">Pending Pickup</p><p className="font-mono">{machine.pending_pickup_count}</p></div>
              <div><p className="text-ink/60 text-xs">Pending Bin Replacement</p><p className="font-mono">{machine.pending_bin_replacement_count}</p></div>
              <div><p className="text-ink/60 text-xs">Cleaning Status</p><StatusBadge status={machine.cleaning_status} /></div>
              <div><p className="text-ink/60 text-xs">Last Visit</p><p className="font-mono">{machine.last_visit_time ? new Date(machine.last_visit_time).toLocaleString() : "N/A"}</p></div>
              <div><p className="text-ink/60 text-xs">Trolley Status</p><p className="font-mono">{machine.trolley_status}</p></div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ACTIONS.map((a) => (
              <button
                key={a.key}
                data-testid={`action-card-${a.key}`}
                onClick={() => navigate(`${a.path}?machine=${machine.id}`)}
                className="bg-oat hover:bg-stone/40 border border-clay/40 rounded-lg p-5 text-left transition-colors flex items-center gap-3 min-h-[76px]"
              >
                <div className="h-11 w-11 rounded-full bg-beet/10 flex items-center justify-center shrink-0">
                  <a.icon className="h-5 w-5 text-beet" />
                </div>
                <span className="font-semibold text-ink">{a.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
