import React, { useEffect, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import api from "@/lib/api";

export default function BinStorage() {
  const [data, setData] = useState({ grouped: [], saved_bins: [] });

  useEffect(() => { api.get("/kitchen/bin-storage").then(({ data }) => setData(data)); }, []);

  return (
    <div data-testid="bin-storage-page">
      <PageHeader title="Bin Storage" description="Bins grouped by ingredient and type, with expiry details" />

      <h3 className="font-display font-semibold text-ink mb-2">Saved Bins (Ready / Handed Over)</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {data.saved_bins.length === 0 && <p className="text-sm text-ink/60" data-testid="saved-bins-empty">No saved bins yet.</p>}
        {data.saved_bins.map((b) => (
          <Card key={b.id} className="bg-oat border-clay/40" data-testid={`saved-bin-card-${b.id}`}>
            <CardContent className="p-3 text-sm">
              <div className="flex justify-between items-start">
                <p className="font-semibold text-ink">{b.ingredient_name}</p>
                <StatusBadge status={b.status} />
              </div>
              <p className="text-xs text-ink/60 font-mono">{b.machine_label}</p>
              <p className="text-xs font-mono mt-1">Qty: {b.quantity} {b.unit}</p>
              <p className="text-xs font-mono">Expiry: {new Date(b.expiry_date).toLocaleDateString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <h3 className="font-display font-semibold text-ink mb-2">Bins by Type</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {data.grouped.map((g) => (
          <Card key={g.ingredient_code} className="bg-oat border-clay/40" data-testid={`bin-group-${g.ingredient_code}`}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{g.ingredient_code} &middot; {g.bin_type}</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {g.bins.map((b) => (
                <div key={b.id} className="flex justify-between text-xs font-mono">
                  <span className="truncate">{b.id}</span>
                  <StatusBadge status={b.status} className="text-[10px] py-0" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
