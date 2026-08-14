import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import DataTable from "@/components/shared/DataTable";
import { useMeta, fmt } from "@/components/maint/useMaint";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

const EMPTY = { part_code: "", old_part_code: "", new_part_code: "", serial_number: "", quantity: 1,
                component: "", reason: "", testing_result: "", comment: "" };

export default function PartsReplacement() {
  const meta = useMeta();
  const [params] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [woId, setWoId] = useState(params.get("wo") || "");
  const [parts, setParts] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [usage, setUsage] = useState([]);
  const { toast } = useToast();

  const load = useCallback(() => {
    api.get("/maintenance/work-orders?active=true").then(({ data }) => setOrders(data));
    api.get("/maintenance/my-parts").then(({ data }) => setParts(data));
    api.get("/maintenance/parts-usage").then(({ data }) => setUsage(data));
  }, []);
  useEffect(() => { load(); }, [load]);

  const wo = orders.find((o) => o.id === woId);
  const part = parts.find((p) => p.part_code === form.part_code);

  const submit = async () => {
    try {
      const { data } = await api.post("/maintenance/parts-replacement", {
        work_order_id: woId, component: form.component, part_code: form.part_code,
        old_part_code: form.old_part_code || form.part_code, new_part_code: form.new_part_code || form.part_code,
        part_name: part?.part_name || form.part_code, serial_number: form.serial_number || null,
        quantity: Number(form.quantity), reason: form.reason, testing_result: form.testing_result || null,
        comment: form.comment || null,
      });
      toast({ title: data.message });
      setForm(EMPTY);
      load();
    } catch (e) {
      toast({ title: "Replacement not recorded", description: formatApiError(e), variant: "destructive" });
    }
  };

  const columns = [
    { key: "created_at", label: "Date/Time", render: (r) => fmt(r.created_at) },
    { key: "work_order_ref", label: "Work Order", mono: true },
    { key: "machine_label", label: "Machine" },
    { key: "component", label: "Component" },
    { key: "part_name", label: "Part" },
    { key: "old_part_code", label: "Old Part Code", mono: true },
    { key: "new_part_code", label: "New Part Code", mono: true },
    { key: "serial_number", label: "Serial No.", mono: true },
    { key: "quantity", label: "Qty" },
    { key: "reason", label: "Reason" },
    { key: "testing_result", label: "Testing Result" },
  ];

  return (
    <div data-testid="parts-replacement-page">
      <PageHeader title="Parts Replacement" description="Record a physical part replacement against a work order" />

      <Card className="bg-oat border-clay/40 mb-6" data-testid="parts-replacement-form">
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs uppercase text-ink/60">Work Order</label>
              <SearchableSelect options={orders.map((o) => ({ value: o.id, label: `${o.wo_id} \u00b7 ${o.issue_type} \u00b7 ${o.machine_label}` }))}
                                 value={woId} onChange={setWoId} placeholder="Select work order" testId="replacement-wo-select" />
            </div>
            <div>
              <label className="text-xs uppercase text-ink/60">Machine</label>
              <Input value={wo?.machine_label || ""} disabled className="bg-bone" data-testid="replacement-machine-display" />
            </div>
            <div>
              <label className="text-xs uppercase text-ink/60">Component</label>
              <SearchableSelect options={(meta?.component_categories || []).map((c) => ({ value: c, label: c }))}
                                 value={form.component} onChange={(v) => setForm({ ...form, component: v })}
                                 placeholder="Select component" testId="replacement-component-select" />
            </div>
            <div>
              <label className="text-xs uppercase text-ink/60">Part (from your inventory)</label>
              <SearchableSelect options={parts.map((p) => ({ value: p.part_code, label: `${p.part_name} (${p.part_code}) \u00b7 available ${p.available_qty}` }))}
                                 value={form.part_code} onChange={(v) => setForm({ ...form, part_code: v, new_part_code: v })}
                                 placeholder="Select part" testId="replacement-part-select" />
            </div>
            <div>
              <label className="text-xs uppercase text-ink/60">Old Part Code</label>
              <Input value={form.old_part_code} onChange={(e) => setForm({ ...form, old_part_code: e.target.value })}
                      placeholder={form.part_code} className="bg-bone" data-testid="replacement-old-part-input" />
            </div>
            <div>
              <label className="text-xs uppercase text-ink/60">New Part Code</label>
              <Input value={form.new_part_code} onChange={(e) => setForm({ ...form, new_part_code: e.target.value })}
                      placeholder={form.part_code} className="bg-bone" data-testid="replacement-new-part-input" />
            </div>
            <div>
              <label className="text-xs uppercase text-ink/60">Serial Number (if available)</label>
              <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                      className="bg-bone" data-testid="replacement-serial-input" />
            </div>
            <div>
              <label className="text-xs uppercase text-ink/60">Quantity Used</label>
              <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                      className="bg-bone" data-testid="replacement-qty-input" />
            </div>
            <div>
              <label className="text-xs uppercase text-ink/60">Replacement Reason</label>
              <SearchableSelect options={(meta?.replacement_reasons || []).map((r) => ({ value: r, label: r }))}
                                 value={form.reason} onChange={(v) => setForm({ ...form, reason: v })}
                                 placeholder="Select reason" testId="replacement-reason-select" />
            </div>
            <div>
              <label className="text-xs uppercase text-ink/60">Testing Result</label>
              <Input value={form.testing_result} onChange={(e) => setForm({ ...form, testing_result: e.target.value })}
                      className="bg-bone" data-testid="replacement-testing-input" />
            </div>
          </div>
          <Textarea placeholder="Comment" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })}
                     className="bg-bone" data-testid="replacement-comment-input" />
          <Button onClick={submit} disabled={!woId || !form.part_code || !form.component || !form.reason}
                   data-testid="replacement-submit-btn" className="bg-beet hover:bg-beet-hover text-bone">
            Save Part Replacement
          </Button>
          <p className="text-xs text-ink/60">Saving reduces your spare-part inventory, updates the work order, service history and the spare parts usage report.</p>
        </CardContent>
      </Card>

      <h3 className="font-display font-semibold text-ink mb-2">My Replacement History</h3>
      <DataTable columns={columns} rows={usage} testId="parts-usage-table" emptyText="You have not replaced any parts yet." />
    </div>
  );
}
