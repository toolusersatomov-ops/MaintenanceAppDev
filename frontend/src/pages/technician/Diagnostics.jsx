import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stethoscope, CheckCircle2, XCircle } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";

export default function TechDiagnostics() {
  const [machines, setMachines] = useState([]);
  const [machineId, setMachineId] = useState("");
  const [history, setHistory] = useState([]);
  const [running, setRunning] = useState(false);
  const { toast } = useToast();

  useEffect(() => { api.get("/catalog/machines").then(({ data }) => { setMachines(data); if (data.length) setMachineId(data[0].id); }); }, []);

  const load = (mid) => api.get(`/maintenance/diagnostics?machine_id=${mid}`).then(({ data }) => setHistory(data));
  useEffect(() => { if (machineId) load(machineId); }, [machineId]);

  const run = async () => {
    setRunning(true);
    try {
      await api.post("/maintenance/diagnostics/run", { machine_id: machineId });
      toast({ title: "Diagnostics run completed" });
      load(machineId);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div data-testid="machine-diagnostics-page">
      <PageHeader title="Machine Diagnostics" description="Run and review diagnostic checks for a machine" />
      <div className="max-w-md mb-4 flex gap-2">
        <SearchableSelect options={machines.map((m) => ({ value: m.id, label: m.label }))} value={machineId} onChange={setMachineId} testId="diagnostics-machine-select" />
      </div>
      <Button onClick={run} disabled={running} data-testid="run-diagnostics-btn" className="mb-6 bg-beet hover:bg-beet-hover text-bone">
        <Stethoscope className="h-4 w-4 mr-2" /> Run Diagnostics
      </Button>

      <div className="space-y-4">
        {history.map((h) => (
          <Card key={h.id} className="bg-oat border-clay/40" data-testid={`diagnostics-result-${h.id}`}>
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-ink mb-2">{new Date(h.created_at).toLocaleString()} &middot; Overall: {h.overall_result}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {h.checks.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-bone rounded px-2 py-1">
                    <span>{c.check}</span>
                    <span className="flex items-center gap-1 font-mono">
                      {c.value} {c.result === "Pass" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {history.length === 0 && <p className="text-sm text-ink/60" data-testid="diagnostics-empty">No diagnostics run yet for this machine.</p>}
      </div>
    </div>
  );
}
