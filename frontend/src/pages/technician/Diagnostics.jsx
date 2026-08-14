import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import PhotoCapture from "@/components/maint/PhotoCapture";
import { useMeta, useMachines, machineOptions, fmt } from "@/components/maint/useMaint";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function Diagnostics() {
  const meta = useMeta();
  const { machines } = useMachines();
  const [params] = useSearchParams();
  const [machineId, setMachineId] = useState(params.get("machine_id") || "");
  const [woId, setWoId] = useState(params.get("wo") || "");
  const [orders, setOrders] = useState([]);
  const [rows, setRows] = useState({});
  const [history, setHistory] = useState([]);
  const { toast } = useToast();

  useEffect(() => { api.get("/maintenance/work-orders?active=true").then(({ data }) => setOrders(data)); }, []);
  useEffect(() => { if (!machineId && machines.length) setMachineId(machines[0].machine_id); }, [machines, machineId]);
  useEffect(() => {
    if (!machineId) return;
    api.get(`/maintenance/diagnostics?machine_id=${machineId}`).then(({ data }) => setHistory(data));
  }, [machineId]);

  const setRow = (component, patch) => setRows((prev) => ({ ...prev, [component]: { ...prev[component], ...patch } }));

  const submit = async () => {
    const items = (meta?.diagnostic_checks || [])
      .filter((c) => rows[c.component]?.status)
      .map((c) => ({
        component: c.component, component_id: c.component_id, expected: c.expected,
        reading: rows[c.component].reading || "", status: rows[c.component].status,
        error_code: rows[c.component].status === "Pass" ? null : c.error_code,
        comment: rows[c.component].comment || null, photo: rows[c.component].photo || null,
      }));
    try {
      await api.post("/maintenance/diagnostics", { machine_id: machineId, work_order_id: woId || null, items });
      toast({ title: `Diagnostics saved (${items.length} checks)` });
      setRows({});
      const { data } = await api.get(`/maintenance/diagnostics?machine_id=${machineId}`);
      setHistory(data);
    } catch (e) {
      toast({ title: "Could not save diagnostics", description: formatApiError(e), variant: "destructive" });
    }
  };

  const recorded = Object.values(rows).filter((r) => r?.status).length;

  return (
    <div data-testid="diagnostics-page">
      <PageHeader title="Machine Diagnostics" description="Run the 30-point technical diagnostic on an assigned machine" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 max-w-3xl">
        <SearchableSelect options={machineOptions(machines)} value={machineId} onChange={setMachineId}
                           placeholder="Select Machine" testId="diagnostics-machine-select" />
        <SearchableSelect options={[{ value: "", label: "No work order (ad-hoc check)" },
                                     ...orders.map((o) => ({ value: o.id, label: `${o.wo_id} \u00b7 ${o.issue_type} \u00b7 ${o.machine_label}` }))]}
                           value={woId} onChange={setWoId} placeholder="Link to work order" testId="diagnostics-wo-select" />
      </div>

      <div className="rounded-md border border-stone bg-oat overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone text-left">
              {["Component", "Component ID", "Expected Value", "Reading", "Status", "Error Code", "Comment", "Photo"].map((h) => (
                <th key={h} className="p-2 font-semibold text-ink whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(meta?.diagnostic_checks || []).map((c) => {
              const row = rows[c.component] || {};
              const slug = c.component.toLowerCase().replace(/[\s/]+/g, "-");
              return (
                <tr key={c.component} className="border-b border-stone/60" data-testid={`diag-row-${slug}`}>
                  <td className="p-2 text-ink font-medium whitespace-nowrap">{c.component}</td>
                  <td className="p-2 font-mono text-xs text-ink/70">{c.component_id}</td>
                  <td className="p-2 text-xs text-ink/70 whitespace-nowrap">{c.expected}</td>
                  <td className="p-2 w-40">
                    <Input value={row.reading || ""} onChange={(e) => setRow(c.component, { reading: e.target.value })}
                            className="bg-bone h-8" placeholder="Measured" data-testid={`diag-reading-${slug}`} />
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      {(meta?.diagnostic_statuses || []).map((s) => (
                        <button key={s} onClick={() => setRow(c.component, { status: s })}
                                 data-testid={`diag-status-${slug}-${s.toLowerCase()}`}
                                 className={`px-2 py-1 rounded text-xs border ${row.status === s ? "bg-beet text-bone border-beet" : "bg-bone text-ink border-clay/50"}`}>{s}</button>
                      ))}
                    </div>
                  </td>
                  <td className="p-2 font-mono text-xs text-ink/70">{row.status && row.status !== "Pass" ? c.error_code : "\u2014"}</td>
                  <td className="p-2 w-48">
                    <Input value={row.comment || ""} onChange={(e) => setRow(c.component, { comment: e.target.value })}
                            className="bg-bone h-8" placeholder={row.status === "Fail" ? "Mandatory" : "Optional"}
                            data-testid={`diag-comment-${slug}`} />
                  </td>
                  <td className="p-2">
                    <PhotoCapture slug={`diag-${slug}`} value={row.photo} onCapture={(p) => setRow(c.component, { photo: p })}
                                   label="Photo" testId={`diag-photo-${slug}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <Button onClick={submit} disabled={!recorded} data-testid="diagnostics-submit-btn" className="bg-beet hover:bg-beet-hover text-bone">
          Save Diagnostics ({recorded})
        </Button>
        <p className="text-xs text-ink/60">A comment is mandatory for every check marked <b>Fail</b>.</p>
      </div>

      <h3 className="font-display font-semibold text-ink mb-2">Diagnostic History</h3>
      <div className="space-y-2">
        {history.length === 0 && <p className="text-sm text-ink/60" data-testid="diagnostics-history-empty">No diagnostics recorded for this machine yet.</p>}
        {history.map((d) => (
          <Card key={d.id} className="bg-oat border-clay/40" data-testid={`diagnostic-record-${d.diag_id}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-ink font-semibold font-mono">{d.diag_id} &middot; {d.machine_label}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink/60">{fmt(d.created_at)} &middot; {d.technician}</span>
                  <StatusBadge status={d.overall_result} />
                </div>
              </div>
              <p className="text-xs text-ink/70 mt-1">
                Pass {d.summary?.Pass || 0} &middot; Warning {d.summary?.Warning || 0} &middot; Fail {d.summary?.Fail || 0}
                {d.work_order_ref ? ` \u00b7 ${d.work_order_ref}` : ""}
              </p>
              <div className="mt-2 space-y-1">
                {d.items.filter((i) => i.status !== "Pass").map((i) => (
                  <p key={i.component} className="text-xs text-ink/80">
                    <StatusBadge status={i.status} className="mr-2" /> {i.component} ({i.error_code}) &mdash; {i.reading || "\u2014"} {i.comment ? `\u00b7 ${i.comment}` : ""}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
