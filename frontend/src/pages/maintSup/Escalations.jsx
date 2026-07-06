import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function Escalations() {
  const [items, setItems] = useState([]);
  const { toast } = useToast();

  const load = () => api.get("/maintenance/escalations").then(({ data }) => setItems(data));
  useEffect(() => { load(); }, []);

  const resolve = async (id) => {
    try {
      await api.post(`/maintenance/escalations/${id}/resolve`);
      toast({ title: "Escalation resolved" });
      load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  return (
    <div data-testid="escalations-page">
      <PageHeader title="Escalations" description="Recurring or unresolved issues raised by technicians for supervisor review" />
      <div className="space-y-2">
        {items.map((e) => (
          <Card key={e.id} className="bg-oat border-clay/40" data-testid={`escalation-${e.id}`}>
            <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-sm text-ink">{e.machine_label}</p>
                <p className="text-xs text-ink/70 mt-1">{e.reason}</p>
                <p className="text-xs text-ink/60 font-mono mt-1">Raised by {e.raised_by} &middot; {new Date(e.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={e.status} />
                {e.status === "Open" && (
                  <Button size="sm" onClick={() => resolve(e.id)} data-testid={`resolve-escalation-${e.id}`} className="bg-beet hover:bg-beet-hover text-bone">
                    Mark Resolved
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && <p className="text-sm text-ink/60" data-testid="escalations-empty">No escalations raised.</p>}
      </div>
    </div>
  );
}
