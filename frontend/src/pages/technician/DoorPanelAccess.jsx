import React, { useEffect, useState, useCallback } from "react";
import { DoorOpen, DoorClosed } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import DataTable from "@/components/shared/DataTable";
import { useMachines, machineOptions, fmt } from "@/components/maint/useMaint";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function DoorPanelAccess() {
  const { machines } = useMachines();
  const [machineId, setMachineId] = useState("");
  const [panels, setPanels] = useState([]);
  const [logs, setLogs] = useState([]);
  const { toast } = useToast();

  useEffect(() => { if (!machineId && machines.length) setMachineId(machines[0].machine_id); }, [machines, machineId]);

  const load = useCallback(() => {
    if (!machineId) return;
    api.get(`/maintenance/panel-access?machine_id=${machineId}`).then(({ data }) => { setPanels(data.panels); setLogs(data.logs); });
  }, [machineId]);
  useEffect(() => { load(); }, [load]);

  const send = async (panel, command) => {
    try {
      const { data } = await api.post("/maintenance/panel-access", { machine_id: machineId, panel, command });
      toast({ title: data.message });
      load();
    } catch (e) {
      toast({ title: "Command failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const columns = [
    { key: "created_at", label: "Date/Time", render: (r) => fmt(r.created_at) },
    { key: "machine_label", label: "Machine" },
    { key: "panel", label: "Door / Panel" },
    { key: "command", label: "Command" },
    { key: "technician", label: "Technician" },
    { key: "result", label: "Result" },
  ];

  return (
    <div data-testid="door-panel-access-page">
      <PageHeader title="Door / Panel Access" description="Open and close service doors and panels on your assigned machines" />
      <div className="max-w-md mb-6">
        <SearchableSelect options={machineOptions(machines)} value={machineId} onChange={setMachineId} testId="panel-access-machine-select" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {panels.map((p) => {
          const slug = p.toLowerCase().replace(/[\s/]+/g, "-");
          return (
            <Card key={p} className="bg-oat border-clay/40" data-testid={`panel-card-${slug}`}>
              <CardContent className="p-4 space-y-2">
                <p className="font-semibold text-ink text-center mb-2">{p}</p>
                <Button variant="outline" onClick={() => send(p, "Open")} data-testid={`panel-open-${slug}`} className="w-full justify-start gap-2">
                  <DoorOpen className="h-4 w-4" /> Open
                </Button>
                <Button variant="outline" onClick={() => send(p, "Close")} data-testid={`panel-close-${slug}`} className="w-full justify-start gap-2">
                  <DoorClosed className="h-4 w-4" /> Close
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <h3 className="font-display font-semibold text-ink mb-2">Access Log</h3>
      <DataTable columns={columns} rows={logs} testId="panel-access-log-table" emptyText="No access commands logged for this machine yet." />
    </div>
  );
}
