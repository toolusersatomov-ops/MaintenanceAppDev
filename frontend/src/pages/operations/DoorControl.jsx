import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { DoorOpen, DoorClosed, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import useAssignedMachines from "@/hooks/useAssignedMachines";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";

const DOORS = ["Right Door", "Left Door", "Back Door"];
const ACTIONS = [
  { key: "Open Door", icon: DoorOpen },
  { key: "Close Door", icon: DoorClosed },
  { key: "Confirm Door Closed", icon: ShieldCheck },
];

export default function DoorControl() {
  const [params] = useSearchParams();
  const { options } = useAssignedMachines();
  const [machineId, setMachineId] = useState(params.get("machine") || "");
  const [logs, setLogs] = useState([]);
  const { toast } = useToast();

  useEffect(() => { if (options.length && !machineId) setMachineId(options[0].value); }, [options, machineId]);

  const load = useCallback(() => {
    if (!machineId) return;
    api.get(`/operations/door-control?machine_id=${machineId}`).then(({ data }) => setLogs(data.logs));
  }, [machineId]);
  useEffect(() => { load(); }, [load]);

  const doAction = async (door, action) => {
    await api.post("/operations/door-control/action", { machine_id: machineId, door, action });
    toast({ title: `${door}: ${action} logged` });
    load();
  };

  return (
    <div data-testid="door-control-page">
      <PageHeader title="Door Control" description="Open, close, and confirm machine doors. All actions are logged." />
      <div className="max-w-md mb-6">
        <SearchableSelect options={options} value={machineId} onChange={setMachineId} testId="door-control-machine-select" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {DOORS.map((door) => (
          <Card key={door} className="bg-oat border-clay/40" data-testid={`door-card-${door.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-4 space-y-2">
              <p className="font-semibold text-ink text-center mb-2">{door}</p>
              {ACTIONS.map((a) => (
                <Button
                  key={a.key}
                  variant="outline"
                  onClick={() => doAction(door, a.key)}
                  data-testid={`door-action-${door.toLowerCase().replace(/\s+/g, "-")}-${a.key.toLowerCase().replace(/\s+/g, "-")}`}
                  className="w-full py-3 justify-start gap-2"
                >
                  <a.icon className="h-4 w-4" /> {a.key}
                </Button>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      <h3 className="font-display font-semibold text-ink mb-2">Recent Door Logs</h3>
      <div className="space-y-1">
        {logs.length === 0 && <p className="text-sm text-ink/60" data-testid="door-logs-empty">No door logs yet.</p>}
        {logs.map((l) => (
          <div key={l.id} className="text-xs font-mono bg-oat border border-clay/30 rounded p-2" data-testid={`door-log-${l.id}`}>
            {new Date(l.created_at).toLocaleString()} &middot; {l.details.door} &middot; {l.details.action} &middot; {l.username}
          </div>
        ))}
      </div>
    </div>
  );
}
