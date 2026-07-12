import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Sparkles } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import QRScanSim from "@/components/shared/QRScanSim";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

const CLEANING_GUIDE = [
  { stage: "Returned to Kitchen", hint: "Bring the dirty bin to the wash area" },
  { stage: "Washing", hint: "Empty leftovers, pre-rinse, wash with food-safe detergent and sanitize" },
  { stage: "Drying", hint: "Air-dry upside down; confirm no residue, moisture or odour" },
  { stage: "Clean / Ready for Filling", hint: "Store in Kitchen Storage, ready for the next fill" },
];

export default function CleaningBins() {
  const [items, setItems] = useState([]);
  const [counters, setCounters] = useState({ total: 0, cleaned: 0, pending: 0 });
  const [justCleaned, setJustCleaned] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const { toast } = useToast();

  const load = () => api.get("/kitchen/cleaning-bins").then(({ data }) => {
    setItems(data.items || data);
    if (data.counters) setCounters(data.counters);
  });
  useEffect(() => { load(); }, []);

  const handleScan = async (qr_code_id) => {
    try {
      const { data } = await api.post("/kitchen/cleaning-bins/scan", { qr_code_id });
      toast({ title: data.message, description: `${data.bin_id} is back in the spare pool.` });
      setJustCleaned((p) => [...p, qr_code_id]);
      load();
    } catch (e) {
      toast({ title: "Scan failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const complete = async (id) => {
    setBusyId(id);
    try {
      const { data } = await api.post(`/kitchen/cleaning-bins/${id}/complete`);
      toast({ title: data.message });
      load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const scannable = items.map((i) => ({ qr_code_id: i.qr_code_id, label: `${i.ingredient_name} Bin`, sublabel: i.bin_id }));

  return (
    <div data-testid="cleaning-bins-page">
      <PageHeader title="Cleaning Bins" description="Scan a dirty bin QR to instantly mark it clean - built for busy hands" />

      <div className="mb-4">
        <QRScanSim
          options={scannable}
          onScan={handleScan}
          triggerLabel="Open Camera / Scan Dirty Bin QR"
          testId="cleaning-bins-scan-btn"
          emptyText="No dirty bins pending cleaning."
          demoNote="Demo Mode: Select a QR from the list to simulate scanning. In the real flow, Kitchen Staff can scan physical bin QRs one after another and matching bins will automatically be marked cleaned."
        />
      </div>

      <div className="flex items-center gap-4 mb-4 font-mono text-sm" data-testid="cleaning-counters">
        <span data-testid="counter-total">Total Dirty Bins: <b>{counters.total}</b></span>
        <span className="text-green-700" data-testid="counter-cleaned">Cleaned: <b>{counters.cleaned}</b></span>
        <span className="text-beet" data-testid="counter-pending">Pending: <b>{counters.pending}</b></span>
        {counters.total > 0 && <span className="text-ink/60">Cleaned {counters.cleaned} of {counters.total} bins</span>}
      </div>

      <div className="rounded-lg border border-stone/60 bg-bone/60 p-3 mb-4" data-testid="cleaning-guide">
        <p className="text-xs font-bold uppercase tracking-wide text-ink/50 mb-2">Cleaning Guide</p>
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {CLEANING_GUIDE.map((step, i) => (
            <li key={step.stage} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-stone/50 text-ink/70 text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
              <span><span className="font-medium text-ink">{step.stage}</span><span className="text-ink/60"> — {step.hint}</span></span>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-3">
        {items.length === 0 && <p className="text-sm text-ink/60 py-6 text-center" data-testid="cleaning-bins-empty">No bins currently in the cleaning lifecycle.</p>}
        {items.map((item) => (
          <Card key={item.id} className="bg-oat border-clay/40" data-testid={`cleaning-bin-card-${item.id}`}>
            <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-ink flex items-center gap-2">
                  {item.ingredient_name} Bin &middot; {item.bin_id}
                  {justCleaned.includes(item.qr_code_id) && <CheckCircle2 className="h-4 w-4 text-green-600" data-testid={`cleaned-tick-${item.id}`} />}
                </p>
                <p className="text-xs text-ink/60 font-mono">QR: {item.qr_code_id} &middot; Returned by {item.returned_by} &middot; {item.returned_at ? new Date(item.returned_at).toLocaleString() : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={item.status} />
                <Button size="sm" disabled={busyId === item.id} onClick={() => complete(item.id)}
                        data-testid={`complete-cleaning-btn-${item.id}`} className="bg-beet hover:bg-beet-hover text-bone">
                  {busyId === item.id ? <><Sparkles className="h-4 w-4 mr-2 animate-pulse" /> Completing…</> : <><CheckCircle2 className="h-4 w-4 mr-2" /> Mark as Cleaned</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
