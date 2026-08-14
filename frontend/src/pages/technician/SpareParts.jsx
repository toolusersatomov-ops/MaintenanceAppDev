import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import DataTable from "@/components/shared/DataTable";
import { useMeta, useMachines, machineOptions, fmt } from "@/components/maint/useMaint";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function SpareParts() {
  const meta = useMeta();
  const { machines } = useMachines();
  const [parts, setParts] = useState([]);
  const [requests, setRequests] = useState([]);
  const [usage, setUsage] = useState([]);
  const [orders, setOrders] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ part_code: "", quantity: 1, machine_id: "", work_order_id: "", reason: "", priority: "Medium", comment: "" });
  const { toast } = useToast();

  const load = useCallback(() => {
    api.get("/maintenance/my-parts").then(({ data }) => setParts(data));
    api.get("/maintenance/spare-parts-requests").then(({ data }) => setRequests(data));
    api.get("/maintenance/parts-usage").then(({ data }) => setUsage(data));
    api.get("/maintenance/work-orders?active=true").then(({ data }) => setOrders(data));
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    const part = parts.find((p) => p.part_code === form.part_code);
    try {
      await api.post("/maintenance/spare-parts-requests", {
        ...form, quantity: Number(form.quantity), work_order_id: form.work_order_id || null,
        part_name: part?.part_name || form.part_code,
      });
      toast({ title: "Request sent to Maintenance Supervisor" });
      setOpen(false);
      setForm({ part_code: "", quantity: 1, machine_id: "", work_order_id: "", reason: "", priority: "Medium", comment: "" });
      load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const receive = async (req) => {
    try {
      const { data } = await api.post(`/maintenance/spare-parts-requests/${req.id}/receive`);
      toast({ title: data.message });
      load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const partColumns = [
    { key: "part_code", label: "Part Code", mono: true },
    { key: "part_name", label: "Part Name" },
    { key: "assigned_qty", label: "Assigned Qty" },
    { key: "used_qty", label: "Used Qty" },
    { key: "available_qty", label: "Available Qty" },
    { key: "min_qty", label: "Minimum Qty" },
    { key: "last_used_machine_label", label: "Last Used Machine" },
    { key: "last_used_work_order", label: "Last Used Work Order", mono: true },
    { key: "last_used_at", label: "Last Used Date", render: (r) => fmt(r.last_used_at) },
  ];

  const reqColumns = [
    { key: "req_id", label: "Request ID", mono: true },
    { key: "part_name", label: "Part" },
    { key: "quantity", label: "Qty" },
    { key: "machine_label", label: "Machine" },
    { key: "work_order_ref", label: "Work Order", mono: true },
    { key: "priority", label: "Priority", render: (r) => <StatusBadge status={r.priority} /> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "requested_at", label: "Requested", render: (r) => fmt(r.requested_at) },
    { key: "supervisor_comment", label: "Supervisor Comment" },
    { key: "actions", label: "", render: (r) => (r.status === "Issued"
        ? <Button size="sm" onClick={() => receive(r)} data-testid={`receive-part-${r.req_id}`} className="bg-beet hover:bg-beet-hover text-bone">Mark Received</Button>
        : null) },
  ];

  const usageColumns = [
    { key: "created_at", label: "Date", render: (r) => fmt(r.created_at) },
    { key: "part_name", label: "Part" },
    { key: "quantity", label: "Qty" },
    { key: "machine_label", label: "Machine" },
    { key: "work_order_ref", label: "Work Order", mono: true },
    { key: "reason", label: "Reason" },
  ];

  return (
    <div data-testid="spare-parts-page">
      <PageHeader title="Spare Parts" description="Your part inventory, requests and usage history"
        actions={<Button onClick={() => setOpen(true)} data-testid="request-part-btn" className="bg-beet hover:bg-beet-hover text-bone">Request Additional Part</Button>} />

      <h3 className="font-display font-semibold text-ink mb-2">My Inventory</h3>
      <DataTable columns={partColumns} rows={parts} testId="my-parts-table" emptyText="No parts assigned to you yet." />

      <h3 className="font-display font-semibold text-ink mb-2 mt-8">My Requests</h3>
      <DataTable columns={reqColumns} rows={requests} testId="my-part-requests-table" emptyText="No spare part requests raised." />

      <h3 className="font-display font-semibold text-ink mb-2 mt-8">Usage History</h3>
      <DataTable columns={usageColumns} rows={usage} testId="my-parts-usage-table" emptyText="No parts used yet." />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-bone" data-testid="spare-part-request-dialog">
          <DialogHeader><DialogTitle>Request Additional Part</DialogTitle></DialogHeader>
          <SearchableSelect options={parts.map((p) => ({ value: p.part_code, label: `${p.part_name} (${p.part_code})` }))}
                             value={form.part_code} onChange={(v) => setForm({ ...form, part_code: v })}
                             placeholder="Select part" testId="request-part-select" />
          <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  className="bg-bone" data-testid="request-part-qty" />
          <SearchableSelect options={machineOptions(machines)} value={form.machine_id}
                             onChange={(v) => setForm({ ...form, machine_id: v })} placeholder="Machine" testId="request-part-machine" />
          <SearchableSelect options={[{ value: "", label: "No work order" }, ...orders.map((o) => ({ value: o.id, label: `${o.wo_id} \u00b7 ${o.machine_label}` }))]}
                             value={form.work_order_id} onChange={(v) => setForm({ ...form, work_order_id: v })}
                             placeholder="Work order (optional)" testId="request-part-wo" />
          <SearchableSelect options={(meta?.priorities || []).map((p) => ({ value: p, label: p }))} value={form.priority}
                             onChange={(v) => setForm({ ...form, priority: v })} testId="request-part-priority" />
          <Textarea placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                     className="bg-bone" data-testid="request-part-reason" />
          <Textarea placeholder="Comment (optional)" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })}
                     className="bg-bone" data-testid="request-part-comment" />
          <Button onClick={submit} disabled={!form.part_code || !form.machine_id || !form.reason}
                   data-testid="request-part-submit" className="bg-beet hover:bg-beet-hover text-bone">Submit Request</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
