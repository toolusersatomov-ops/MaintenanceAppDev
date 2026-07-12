import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import PageHeader from "@/components/shared/PageHeader";
import BinFillPanel from "@/components/kitchen/BinFillPanel";
import api from "@/lib/api";

export default function BinFilling() {
  const [requests, setRequests] = useState([]);

  const load = () => api.get("/kitchen/preparation-requests?status=In Progress").then(({ data }) => setRequests(data));
  useEffect(() => { load(); }, []);

  return (
    <div data-testid="bin-filling-page">
      <PageHeader title="Bin Filling" description="Continue filling bins for tickets already in progress" />
      <div className="space-y-3">
        {requests.length === 0 && (
          <p className="text-sm text-ink/60 py-6 text-center" data-testid="bin-filling-empty">
            No tickets in progress. Start a preparation request first.
          </p>
        )}
        {requests.map((r) => (
          <Card key={r.id} className="bg-oat border-clay/40" data-testid={`bin-filling-card-${r.id}`}>
            <CardContent className="p-4">
              <p className="font-semibold text-ink">{r.ingredient_name}</p>
              <p className="text-sm text-ink/70 font-mono">Ticket: {(r.id || "").slice(0, 8).toUpperCase()}{r.bulk_order_id ? " · Bulk Order" : ""}</p>
              <BinFillPanel request={r} onDone={load} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
