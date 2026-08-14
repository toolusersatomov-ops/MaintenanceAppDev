import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import DataTable from "@/components/shared/DataTable";
import { useMeta, useMachines, machineOptions, fmt } from "@/components/maint/useMaint";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

const TOLERANCE = 5;

export default function CalibrationTesting() {
  const meta = useMeta();
  const { machines } = useMachines();
  const [params] = useSearchParams();
  const [machineId, setMachineId] = useState(params.get("machine_id") || "");
  const [targets, setTargets] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState({
    slot_id: "", calibration_type: "Liquid Volume Calibration", expected_quantity: "", actual_quantity: "",
    run_time_seconds: "", work_order_id: "", comment: "",
  });
  const [records, setRecords] = useState([]);
  const [filters, setFilters] = useState({ machine_id: "", result: params.get("result") || "", technician: "", bin_id: "" });
  const { toast } = useToast();

  useEffect(() => { if (!machineId && machines.length) setMachineId(machines[0].machine_id); }, [machines, machineId]);
  useEffect(() => { api.get("/maintenance/work-orders?active=true").then(({ data }) => setOrders(data)); }, []);
  useEffect(() => {
    if (!machineId) return;
    api.get(`/maintenance/calibration-targets?machine_id=${machineId}`).then(({ data }) => setTargets(data));
  }, [machineId]);

  const loadRecords = useCallback(() => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && q.set(k, v));
    api.get(`/maintenance/calibrations?${q.toString()}`).then(({ data }) => setRecords(data));
  }, [filters]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  const target = targets.find((t) => t.slot_id === form.slot_id);
  const isLoadCell = form.calibration_type.startsWith("Load Cell");
  const isZero = form.calibration_type === "Load Cell Zero Check";
  const expected = isZero ? 0 : form.calibration_type === "Load Cell 100 g Reference Check" ? 100 : Number(form.expected_quantity || 0);
  const actual = Number(form.actual_quantity || 0);
  const difference = form.actual_quantity === "" ? null : Number((actual - expected).toFixed(3));
  const variance = difference === null ? null : expected ? Number(((difference / expected) * 100).toFixed(2)) : 0;
  const predicted = difference === null ? null : isZero ? (Math.abs(difference) <= 2 ? "PASS" : "FAIL") : (Math.abs(variance) <= TOLERANCE ? "PASS" : "FAIL");

  const submit = async () => {
    try {
      const { data } = await api.post("/maintenance/calibrations", {
        machine_id: machineId, slot_id: target?.slot_id || form.slot_id, bin_id: target?.bin_id || null,
        item: target?.item || null, calibration_type: form.calibration_type,
        expected_quantity: expected, actual_quantity: actual,
        unit: isLoadCell ? "gm" : target?.unit || "ml",
        run_time_seconds: form.run_time_seconds ? Number(form.run_time_seconds) : null,
        work_order_id: form.work_order_id || null, comment: form.comment || null,
      });
      toast({ title: `Calibration ${data.result} \u00b7 variance ${data.variance_pct}%`, variant: data.result === "FAIL" ? "destructive" : undefined });
      setForm({ ...form, actual_quantity: "", comment: "" });
      loadRecords();
    } catch (e) {
      toast({ title: "Calibration not saved", description: formatApiError(e), variant: "destructive" });
    }
  };

  const columns = [
    { key: "cal_id", label: "Calibration ID", mono: true },
    { key: "machine_label", label: "Machine" },
    { key: "slot_id", label: "Slot ID", mono: true },
    { key: "bin_id", label: "Bin ID", mono: true },
    { key: "item", label: "Ingredient / Item" },
    { key: "calibration_type", label: "Calibration Type" },
    { key: "expected_quantity", label: "Expected" },
    { key: "actual_quantity", label: "Actual" },
    { key: "unit", label: "Unit" },
    { key: "variance_pct", label: "Variance %", render: (r) => `${r.variance_pct}%` },
    { key: "result", label: "Result", render: (r) => <StatusBadge status={r.result} /> },
    { key: "technician", label: "Technician" },
    { key: "created_at", label: "Date/Time", render: (r) => fmt(r.created_at) },
    { key: "comment", label: "Comment" },
  ];

  return (
    <div data-testid="calibration-testing-page">
      <PageHeader title="Calibration & Testing" description={`Dispense calibration against standardized bin IDs \u00b7 tolerance \u00b1${TOLERANCE}% (PASS/FAIL is calculated automatically)`} />

      <Card className="bg-oat border-clay/40 mb-6" data-testid="calibration-form-card">
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs uppercase text-ink/60">Machine</label>
              <SearchableSelect options={machineOptions(machines)} value={machineId} onChange={setMachineId} testId="calibration-machine-select" />
            </div>
            <div>
              <label className="text-xs uppercase text-ink/60">Slot / Bin</label>
              <SearchableSelect
                options={targets.map((t) => ({ value: t.slot_id, label: `${t.slot_id} \u00b7 ${t.bin_id || "no bin"} \u00b7 ${t.item}` }))}
                value={form.slot_id} onChange={(v) => setForm({ ...form, slot_id: v })}
                placeholder="Select slot" testId="calibration-slot-select" />
            </div>
            <div>
              <label className="text-xs uppercase text-ink/60">Calibration Type</label>
              <SearchableSelect options={(meta?.calibration_types || []).map((c) => ({ value: c, label: c }))}
                                 value={form.calibration_type} onChange={(v) => setForm({ ...form, calibration_type: v })}
                                 testId="calibration-type-select" />
            </div>
            <div>
              <label className="text-xs uppercase text-ink/60">Expected Quantity {isLoadCell ? "(fixed)" : ""}</label>
              <Input type="number" value={isLoadCell ? expected : form.expected_quantity} disabled={isLoadCell}
                      onChange={(e) => setForm({ ...form, expected_quantity: e.target.value })}
                      className="bg-bone" data-testid="calibration-expected-input" />
            </div>
            <div>
              <label className="text-xs uppercase text-ink/60">Actual Measured Quantity</label>
              <Input type="number" value={form.actual_quantity} onChange={(e) => setForm({ ...form, actual_quantity: e.target.value })}
                      className="bg-bone" data-testid="calibration-actual-input" />
            </div>
            <div>
              <label className="text-xs uppercase text-ink/60">Run Time (seconds, time-based only)</label>
              <Input type="number" value={form.run_time_seconds} onChange={(e) => setForm({ ...form, run_time_seconds: e.target.value })}
                      className="bg-bone" data-testid="calibration-runtime-input" />
            </div>
            <div>
              <label className="text-xs uppercase text-ink/60">Unit</label>
              <Input value={isLoadCell ? "gm" : target?.unit || ""} disabled className="bg-bone" data-testid="calibration-unit-input" />
            </div>
            <div>
              <label className="text-xs uppercase text-ink/60">Link Work Order (optional)</label>
              <SearchableSelect options={[{ value: "", label: "None" }, ...orders.map((o) => ({ value: o.id, label: `${o.wo_id} \u00b7 ${o.machine_label}` }))]}
                                 value={form.work_order_id} onChange={(v) => setForm({ ...form, work_order_id: v })} testId="calibration-wo-select" />
            </div>
            <div className="rounded-md border border-stone bg-bone p-3" data-testid="calibration-computed-panel">
              <p className="text-xs uppercase text-ink/60">System Calculation</p>
              <p className="text-sm text-ink font-mono">Difference: {difference === null ? "\u2014" : difference}</p>
              <p className="text-sm text-ink font-mono">Variance: {variance === null ? "\u2014" : `${variance}%`}</p>
              <p className="text-sm mt-1">Result: {predicted ? <StatusBadge status={predicted} testId="calibration-predicted-result" /> : "\u2014"}</p>
            </div>
          </div>

          <Textarea placeholder={predicted === "FAIL" ? "Comment (mandatory for FAIL)" : "Comment (optional)"}
                     value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })}
                     className="bg-bone" data-testid="calibration-comment-input" />

          <Button onClick={submit}
                   disabled={!machineId || (!form.slot_id && !isLoadCell) || form.actual_quantity === "" || (!isLoadCell && !form.expected_quantity) || (predicted === "FAIL" && !form.comment.trim())}
                   data-testid="calibration-submit-btn" className="bg-beet hover:bg-beet-hover text-bone">
            Save Calibration
          </Button>
        </CardContent>
      </Card>

      <h3 className="font-display font-semibold text-ink mb-2">Calibration History</h3>
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="w-56">
          <SearchableSelect options={[{ value: "", label: "All Machines" }, ...machineOptions(machines)]}
                             value={filters.machine_id} onChange={(v) => setFilters({ ...filters, machine_id: v })}
                             placeholder="Machine" testId="calibration-filter-machine" />
        </div>
        <div className="w-40">
          <SearchableSelect options={[{ value: "", label: "All Results" }, { value: "PASS", label: "PASS" }, { value: "FAIL", label: "FAIL" }]}
                             value={filters.result} onChange={(v) => setFilters({ ...filters, result: v })}
                             placeholder="Result" testId="calibration-filter-result" />
        </div>
        <Input placeholder="Bin ID" value={filters.bin_id} onChange={(e) => setFilters({ ...filters, bin_id: e.target.value })}
                className="bg-bone w-44" data-testid="calibration-filter-bin" />
        <Input placeholder="Technician" value={filters.technician} onChange={(e) => setFilters({ ...filters, technician: e.target.value })}
                className="bg-bone w-40" data-testid="calibration-filter-technician" />
      </div>
      <DataTable columns={columns} rows={records} testId="calibration-history-table" emptyText="No calibration records yet." />
    </div>
  );
}
