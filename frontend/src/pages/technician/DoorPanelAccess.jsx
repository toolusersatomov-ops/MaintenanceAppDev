import React, { useEffect, useState, useCallback } from "react";
import { DoorOpen, DoorClosed } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";

export default function DoorPanelAccess() {
  const [machines, setMachines] = useState([]);
  const [machineId, setMachineId] = useState("");
  const [panels, setPanels] = useState([]);
  const [logs, setLogs] = useState([]);
  const { toast } = useToast();

  useEffect(() => { api.get("/catalog/machines").then(({ data }) => { setMachines(data); if (data.length) setMachineId(data[0].id); }); }, []);

  const load = useCallback(() => {
    if (!machineId) return;
    api.get(`/maintenance/panel-access?machine_id=${machineId}`).then(({ data }) => { setPanels(data.panels); setLogs(data.logs); });
  }, [machineId]);
  useEffect(() => { load(); }, [load]);

  const doAction = async (panel, action) => {
    await api.post("/maintenance/panel-access", { machine_id: machineId, panel, action });
    toast({ title: `${panel}: ${action} logged` });
    load();
  };

  return (
    <div data-testid="door-panel-access-page">
      <PageHeader title="Door / Panel Access" description="Log panel and door access for repair work" />
      <div className="max-w-md mb-6">
        <SearchableSelect options={machines.map((m) => ({ value: m.id, label: m.label }))} value={machineId} onChange={setMachineId} testId="panel-access-machine-select" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {panels.map((p) => (
          <Card key={p} className="bg-oat border-clay/40" data-testid={`panel-card-${p.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-4 space-y-2">
              <p className="font-semibold text-ink text-center mb-2">{p}</p>
              <Button variant="outline" onClick={() => doAction(p, "Open")} data-testid={`panel-open-${p.toLowerCase().replace(/\s+/g, "-")}`} className="w-full justify-start gap-2">
                <DoorOpen className="h-4 w-4" /> Open
              </Button>
              <Button variant="outline" onClick={() => doAction(p, "Close")} data-testid={`panel-close-${p.toLowerCase().replace(/\s+/g, "-")}`} className="w-full justify-start gap-2">
                <DoorClosed className="h-4 w-4" /> Close
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <h3 className="font-display font-semibold text-ink mb-2">Recent Access Logs</h3>
      <div className="space-y-1">
        {logs.length === 0 && <p className="text-sm text-ink/60" data-testid="panel-access-logs-empty">No access logs yet.</p>}
        {logs.map((l) => (
          <div key={l.id} className="text-xs font-mono bg-oat border border-clay/30 rounded p-2" data-testid={`panel-access-log-${l.id}`}>
            {new Date(l.created_at).toLocaleString()} &middot; {l.details.panel} &middot; {l.details.action} &middot; {l.username}
          </div>
        ))}
      </div>
    </div>
  );
}
