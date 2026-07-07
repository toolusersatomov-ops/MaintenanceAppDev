import React, { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import BinFillPanel from "@/components/kitchen/BinFillPanel";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function PreparationRequests() {
  const [requests, setRequests] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const { toast } = useToast();

  const load = () => api.get("/kitchen/preparation-requests").then(({ data }) => setRequests(data));
  useEffect(() => { load(); }, []);

  const startPrep = async (id) => {
    try {
      await api.post(`/kitchen/preparation-requests/${id}/start`);
      toast({ title: "Preparation started" });
      setActiveId(id);
      load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const renderList = (items) => {
    const bulkGroups = {};
    const singles = [];
    items.forEach((r) => {
      if (r.bulk_order_id) {
        bulkGroups[r.bulk_order_id] = bulkGroups[r.bulk_order_id] || [];
        bulkGroups[r.bulk_order_id].push(r);
      } else {
        singles.push(r);
      }
    });

    const renderCard = (r) => (
      <Card key={r.id} className="bg-oat border-clay/40" data-testid={`prep-request-card-${r.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="font-semibold text-ink">{r.ingredient_name}</p>
              <p className="text-sm text-ink/70">{r.machine_label}</p>
              <p className="text-xs font-mono text-ink/60 mt-1">Qty: {r.quantity} {r.unit} (auto-calculated, read-only)</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge status={r.status} />
              {r.status === "Pending" && (
                <Button size="sm" onClick={() => startPrep(r.id)} data-testid={`start-prep-btn-${r.id}`} className="bg-beet hover:bg-beet-hover text-bone">
                  Start Preparation
                </Button>
              )}
              {r.status === "In Progress" && activeId !== r.id && (
                <Button size="sm" variant="outline" onClick={() => setActiveId(r.id)} data-testid={`continue-fill-btn-${r.id}`}>
                  Continue Filling
                </Button>
              )}
            </div>
          </div>
          {r.status === "In Progress" && activeId === r.id && (
            <BinFillPanel request={r} onDone={() => { setActiveId(null); load(); }} />
          )}
        </CardContent>
      </Card>
    );

    if (items.length === 0) {
      return <p className="text-sm text-ink/60 py-6 text-center" data-testid="prep-requests-empty">No requests in this category.</p>;
    }

    return (
      <div className="space-y-4">
        {Object.entries(bulkGroups).map(([bulkId, group]) => (
          <div key={bulkId} className="border border-beet/40 rounded-lg p-3 bg-beet/5" data-testid={`bulk-order-group-${bulkId}`}>
            <p className="text-xs font-mono text-beet font-semibold mb-2">Bulk Order &middot; {group.length} item(s) &middot; {bulkId.slice(0, 8)}</p>
            <div className="space-y-3">{group.map(renderCard)}</div>
          </div>
        ))}
        <div className="space-y-3">{singles.map(renderCard)}</div>
      </div>
    );
  };

  return (
    <div data-testid="preparation-requests-page">
      <PageHeader title="Preparation Requests" description="Kitchen fill tickets created by the Operations Supervisor" />
      <Tabs defaultValue="pending">
        <TabsList className="bg-oat">
          <TabsTrigger value="pending" data-testid="tab-pending">Pending ({requests.filter((r) => r.status === "Pending").length})</TabsTrigger>
          <TabsTrigger value="in_progress" data-testid="tab-in-progress">In Progress ({requests.filter((r) => r.status === "In Progress").length})</TabsTrigger>
          <TabsTrigger value="done" data-testid="tab-done">Saved / Completed</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">{renderList(requests.filter((r) => r.status === "Pending"))}</TabsContent>
        <TabsContent value="in_progress">{renderList(requests.filter((r) => r.status === "In Progress"))}</TabsContent>
        <TabsContent value="done">{renderList(requests.filter((r) => !["Pending", "In Progress"].includes(r.status)))}</TabsContent>
      </Tabs>
    </div>
  );
}
