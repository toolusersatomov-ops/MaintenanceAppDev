import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Sparkles } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

const CLEANING_GUIDE = [
  { stage: "Returned to Kitchen", hint: "Bring the dirty bin to the wash area" },
  { stage: "Washing Pending", hint: "Empty leftover contents and pre-rinse with water" },
  { stage: "Washed", hint: "Wash with food-safe detergent and sanitize thoroughly" },
  { stage: "Drying", hint: "Place upside down on the drying rack to air-dry" },
  { stage: "Dried", hint: "Confirm fully dry — no residue, moisture or odour" },
  { stage: "Clean / Ready for Filling", hint: "Store in Kitchen Storage, ready for the next fill" },
];

export default function CleaningBins() {
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const { toast } = useToast();

  const load = () => api.get("/kitchen/cleaning-bins").then(({ data }) => setItems(data));
  useEffect(() => { load(); }, []);

  const complete = async (id) => {
    setBusyId(id);
    try {
      const { data } = await api.post(`/kitchen/cleaning-bins/${id}/complete`);
      toast({ title: data.message, description: "All cleaning steps completed. Bin is back in the spare pool." });
      load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div data-testid="cleaning-bins-page">
      <PageHeader title="Cleaning Bins" description="Follow the cleaning guide below, then mark the bin as cleaned in one click" />
      <div className="space-y-3">
        {items.length === 0 && <p className="text-sm text-ink/60 py-6 text-center" data-testid="cleaning-bins-empty">No bins currently in the cleaning lifecycle.</p>}
        {items.map((item) => (
          <Card key={item.id} className="bg-oat border-clay/40" data-testid={`cleaning-bin-card-${item.id}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div>
                  <p className="font-semibold text-ink">{item.ingredient_name} Bin &middot; {item.bin_id}</p>
                  <p className="text-xs text-ink/60">{item.machine_label}</p>
                </div>
                <StatusBadge status={item.status} />
              </div>

              <div className="rounded-lg border border-stone/60 bg-bone/60 p-3 mb-3" data-testid={`cleaning-guide-${item.id}`}>
                <p className="text-xs font-bold uppercase tracking-wide text-ink/50 mb-2">Cleaning Guide — read &amp; follow each step</p>
                <ol className="space-y-1.5">
                  {CLEANING_GUIDE.map((step, i) => (
                    <li key={step.stage} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-stone/50 text-ink/70 text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                      <span>
                        <span className="font-medium text-ink">{step.stage}</span>
                        <span className="text-ink/60"> — {step.hint}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <Button
                size="sm"
                disabled={busyId === item.id}
                onClick={() => complete(item.id)}
                data-testid={`complete-cleaning-btn-${item.id}`}
                className="bg-beet hover:bg-beet-hover text-bone"
              >
                {busyId === item.id ? (
                  <><Sparkles className="h-4 w-4 mr-2 animate-pulse" /> Completing…</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4 mr-2" /> Mark as Cleaned — Ready for Filling</>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
