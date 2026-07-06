import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import AlertDetailModal from "@/components/shared/AlertDetailModal";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [staffOptions, setStaffOptions] = useState([]);
  const { toast } = useToast();

  const load = () => api.get("/alerts").then(({ data }) => setAlerts(data));
  useEffect(() => {
    load();
    api.get("/supervisor/users").then(({ data }) => setStaffOptions(data.filter((u) => u.role === "operations_staff").map((u) => ({ value: u.username, label: `${u.name} (${u.username})` }))));
  }, []);

  const acknowledge = async (id) => {
    try {
      await api.post(`/alerts/${id}/acknowledge`);
      toast({ title: "Alert acknowledged" });
      load();
    } catch (e) {
      toast({ title: "Cannot acknowledge", description: formatApiError(e), variant: "destructive" });
    }
  };

  const renderRows = (items) => (
    <div className="space-y-2">
      {items.length === 0 && <p className="text-sm text-ink/60 py-6 text-center" data-testid="alerts-empty">No alerts in this category.</p>}
      {items.map((a) => (
        <Card key={a.id} className="bg-oat border-clay/40" data-testid={`alert-row-${a.id}`}>
          <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="font-semibold text-sm text-ink">{a.alert_type}: {a.ingredient_name}</p>
              <p className="text-xs text-ink/60 font-mono">{a.machine_label} &middot; Priority: {a.priority}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={a.status} />
              <Button size="sm" variant="outline" onClick={() => setSelected(a)} data-testid={`view-alert-details-${a.id}`}>View Details</Button>
              <Button size="sm" variant="ghost" onClick={() => acknowledge(a.id)} data-testid={`acknowledge-alert-${a.id}`}>Acknowledge</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div data-testid="alerts-page">
      <PageHeader title="Alerts" description="Low stock, near expiry, and replacement due alerts across all machines" />
      <Tabs defaultValue="Open">
        <TabsList className="bg-oat">
          <TabsTrigger value="Open" data-testid="alerts-tab-open">Open ({alerts.filter((a) => a.status === "Open").length})</TabsTrigger>
          <TabsTrigger value="Assigned" data-testid="alerts-tab-assigned">Assigned ({alerts.filter((a) => a.status === "Assigned").length})</TabsTrigger>
          <TabsTrigger value="all" data-testid="alerts-tab-all">All</TabsTrigger>
        </TabsList>
        <TabsContent value="Open">{renderRows(alerts.filter((a) => a.status === "Open"))}</TabsContent>
        <TabsContent value="Assigned">{renderRows(alerts.filter((a) => a.status === "Assigned"))}</TabsContent>
        <TabsContent value="all">{renderRows(alerts)}</TabsContent>
      </Tabs>
      <AlertDetailModal
        alert={selected}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
        operationsStaffOptions={staffOptions}
        onChanged={() => { load(); setSelected(null); }}
      />
    </div>
  );
}
