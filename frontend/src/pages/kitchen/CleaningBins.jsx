import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

const LIFECYCLE = ["Dirty / Returned from Machine", "Returned to Kitchen", "Washing Pending", "Washed", "Drying", "Dried", "Clean / Ready for Filling"];

export default function CleaningBins() {
  const [items, setItems] = useState([]);
  const { toast } = useToast();

  const load = () => api.get("/kitchen/cleaning-bins").then(({ data }) => setItems(data));
  useEffect(() => { load(); }, []);

  const advance = async (id) => {
    try {
      const { data } = await api.post(`/kitchen/cleaning-bins/${id}/advance`);
      toast({ title: data.message });
      load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  return (
    <div data-testid="cleaning-bins-page">
      <PageHeader title="Cleaning Bins" description="Dirty bins returned by Operations Staff move through the cleaning lifecycle" />
      <div className="space-y-3">
        {items.length === 0 && <p className="text-sm text-ink/60 py-6 text-center" data-testid="cleaning-bins-empty">No bins currently in the cleaning lifecycle.</p>}
        {items.map((item) => {
          const idx = LIFECYCLE.indexOf(item.status);
          return (
            <Card key={item.id} className="bg-oat border-clay/40" data-testid={`cleaning-bin-card-${item.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <div>
                    <p className="font-semibold text-ink">{item.ingredient_name} Bin &middot; {item.bin_id}</p>
                    <p className="text-xs text-ink/60">{item.machine_label}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <div className="flex items-center gap-1 flex-wrap mb-3">
                  {LIFECYCLE.map((s, i) => (
                    <React.Fragment key={s}>
                      <span className={`text-xs px-2 py-1 rounded-full ${i <= idx ? "bg-beet text-bone" : "bg-stone/50 text-ink/60"}`}>{s}</span>
                      {i < LIFECYCLE.length - 1 && <ArrowRight className="h-3 w-3 text-ink/30" />}
                    </React.Fragment>
                  ))}
                </div>
                {idx < LIFECYCLE.length - 1 && (
                  <Button size="sm" onClick={() => advance(item.id)} data-testid={`advance-cleaning-btn-${item.id}`} className="bg-beet hover:bg-beet-hover text-bone">
                    Advance to "{LIFECYCLE[idx + 1]}"
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
