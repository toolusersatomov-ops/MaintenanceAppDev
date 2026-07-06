import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function SparePartsRequest() {
  const { user } = useAuth();
  const [machines, setMachines] = useState([]);
  const [machineId, setMachineId] = useState("");
  const [partName, setPartName] = useState("");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState([]);
  const { toast } = useToast();

  const load = () => api.get(`/maintenance/spare-parts-requests?technician=${user.username}`).then(({ data }) => setRows(data));
  useEffect(() => {
    api.get("/catalog/machines").then(({ data }) => { setMachines(data); if (data.length) setMachineId(data[0].id); });
    load();
  }, [user.username]);

  const submit = async () => {
    try {
      await api.post("/maintenance/spare-parts-requests", { machine_id: machineId, part_name: partName, quantity: qty, reason });
      toast({ title: "Spare part request sent to Supervisor" });
      setPartName(""); setReason(""); setQty(1);
      load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  return (
    <div data-testid="spare-parts-request-page">
      <PageHeader title="Spare Parts Request" description="Request spare parts needed for a repair" />
      <Card className="bg-oat border-clay/40 mb-6">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SearchableSelect options={machines.map((m) => ({ value: m.id, label: m.label }))} value={machineId} onChange={setMachineId} testId="spare-part-machine-select" />
          <Input placeholder="Part Name" value={partName} onChange={(e) => setPartName(e.target.value)} className="bg-bone" data-testid="spare-part-req-name" />
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="bg-bone" data-testid="spare-part-req-qty" />
          <Textarea placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className="bg-bone sm:col-span-2" data-testid="spare-part-req-reason" />
          <Button onClick={submit} disabled={!partName || !reason} data-testid="spare-part-req-submit" className="bg-beet hover:bg-beet-hover text-bone sm:col-span-2">
            Submit Request
          </Button>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {rows.map((r) => (
          <Card key={r.id} className="bg-oat border-clay/40" data-testid={`spare-part-req-row-${r.id}`}>
            <CardContent className="p-3 flex justify-between items-center">
              <div>
                <p className="text-sm font-semibold text-ink">{r.part_name} x{r.quantity}</p>
                <p className="text-xs text-ink/60">{r.machine_label} &middot; {r.reason}</p>
              </div>
              <StatusBadge status={r.status} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
