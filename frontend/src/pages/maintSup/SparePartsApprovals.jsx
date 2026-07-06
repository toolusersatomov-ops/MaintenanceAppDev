import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";

export default function SparePartsApprovals() {
  const [rows, setRows] = useState([]);
  const { toast } = useToast();
  const load = () => api.get("/maintenance/spare-parts-approvals").then(({ data }) => setRows(data));
  useEffect(() => { load(); }, []);

  const decide = async (id, decision) => {
    await api.post(`/maintenance/spare-parts-approvals/${id}/decision`, { decision });
    toast({ title: `Request ${decision}d` });
    load();
  };

  return (
    <div data-testid="spare-parts-approvals-page">
      <PageHeader title="Spare Parts Approvals" description="Technician requests waiting for your approval" />
      <div className="space-y-2">
        {rows.map((r) => (
          <Card key={r.id} className="bg-oat border-clay/40" data-testid={`approval-row-${r.id}`}>
            <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-sm text-ink">{r.part_name} x{r.quantity}</p>
                <p className="text-xs text-ink/60">{r.machine_label} &middot; {r.technician} &middot; {r.reason}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={r.status} />
                <Button size="sm" onClick={() => decide(r.id, "approve")} data-testid={`approve-part-${r.id}`} className="bg-beet hover:bg-beet-hover text-bone">Approve</Button>
                <Button size="sm" variant="outline" onClick={() => decide(r.id, "reject")} data-testid={`reject-part-${r.id}`}>Reject</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && <p className="text-sm text-ink/60" data-testid="spare-parts-approvals-empty">No pending spare part requests.</p>}
      </div>
    </div>
  );
}
