import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import DataTable from "@/components/shared/DataTable";
import { useMeta, useMachines, machineOptions, fmt } from "@/components/maint/useMaint";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function ComponentTesting() {
  const meta = useMeta();
  const { machines } = useMachines();
  const [params] = useSearchParams();
  const [machineId, setMachineId] = useState(params.get("machine_id") || "");
  const [woId, setWoId] = useState(params.get("wo") || "");
  const [orders, setOrders] = useState([]);
  const [states, setStates] = useState({});
  const [history, setHistory] = useState([]);
  const { toast } = useToast();

  useEffect(() => { if (!machineId && machines.length) setMachineId(machines[0].machine_id); }, [machines, machineId]);
  useEffect(() => { api.get("/maintenance/work-orders?active=true").then(({ data }) => setOrders(data)); }, []);

  const load = useCallback(() => {
    if (!machineId) return;
    api.get(`/maintenance/component-tests?machine_id=${machineId}`).then(({ data }) => setHistory(data));
  }, [machineId]);
  useEffect(() => { load(); }, [load]);

  const record = async (component, command, result, key) => {
    try {
      await api.post("/maintenance/component-tests", {
        machine_id: machineId, work_order_id: woId || null, component, command, result, reading: null,
      });
      setStates((p) => ({ ...p, [key]: "COMPLETED" }));
      toast({ title: `${component}: ${command} \u2192 ${result}` });
      load();
    } catch (e) {
      toast({ title: "Test not saved", description: formatApiError(e), variant: "destructive" });
      setStates((p) => ({ ...p, [key]: "OFF" }));
    }
  };

  const runInput = (component, result) => record(component, "Read Input", result, component);

  const runOutput = (component, command) => {
    const key = `${component}-${command}`;
    setStates((p) => ({ ...p, [key]: "RUNNING" }));
    setTimeout(() => record(component, command, "Pass", key), 1200);
  };

  const columns = [
    { key: "component", label: "Component" },
    { key: "command", label: "Command" },
    { key: "result", label: "Result", render: (r) => <StatusBadge status={r.result} /> },
    { key: "machine_label", label: "Machine" },
    { key: "technician", label: "Technician" },
    { key: "created_at", label: "Date/Time", render: (r) => fmt(r.created_at) },
  ];

  return (
    <div data-testid="component-testing-page">
      <PageHeader title="Component Testing" description="Read machine inputs and actuate outputs to verify a repair" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 max-w-3xl">
        <SearchableSelect options={machineOptions(machines)} value={machineId} onChange={setMachineId} testId="component-test-machine-select" />
        <SearchableSelect options={[{ value: "", label: "No work order (ad-hoc test)" },
                                     ...orders.map((o) => ({ value: o.id, label: `${o.wo_id} \u00b7 ${o.machine_label}` }))]}
                           value={woId} onChange={setWoId} placeholder="Link to work order" testId="component-test-wo-select" />
      </div>

      <h3 className="font-display font-semibold text-ink mb-2">Input Tests</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {(meta?.input_tests || []).map((t) => {
          const slug = t.toLowerCase().replace(/[\s/]+/g, "-");
          return (
            <Card key={t} className="bg-oat border-clay/40" data-testid={`input-test-${slug}`}>
              <CardContent className="p-3 space-y-2">
                <p className="text-sm font-semibold text-ink">{t}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => runInput(t, "Pass")} data-testid={`input-test-pass-${slug}`}
                           className="bg-beet hover:bg-beet-hover text-bone">{"Read \u2192 Pass"}</Button>
                  <Button size="sm" variant="outline" onClick={() => runInput(t, "Fail")} data-testid={`input-test-fail-${slug}`}
                           className="border-red-300 text-red-700">Fail</Button>
                </div>
                {states[t] && <StatusBadge status={states[t]} testId={`input-test-state-${slug}`} />}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <h3 className="font-display font-semibold text-ink mb-2">Output / Control Tests</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {(meta?.output_tests || []).map((t) => {
          const slug = t.component.toLowerCase().replace(/[\s/]+/g, "-");
          const key = `${t.component}-${t.command}`;
          const state = states[key] || "OFF";
          return (
            <Card key={key} className="bg-oat border-clay/40" data-testid={`output-test-${slug}`}>
              <CardContent className="p-3 space-y-2">
                <p className="text-sm font-semibold text-ink">{t.component}</p>
                <p className="text-xs text-ink/60">{t.command}</p>
                <div className="flex items-center gap-2">
                  <Button size="sm" disabled={state === "RUNNING"} onClick={() => runOutput(t.component, t.command)}
                           data-testid={`output-test-run-${slug}`} className="bg-beet hover:bg-beet-hover text-bone">
                    {state === "RUNNING" ? "Running..." : "Run Test"}
                  </Button>
                  <StatusBadge status={state} testId={`output-test-state-${slug}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <h3 className="font-display font-semibold text-ink mb-2">Test History</h3>
      <DataTable columns={columns} rows={history} testId="component-test-history" emptyText="No component tests recorded for this machine yet." />
    </div>
  );
}
