import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function ChangeRequests() {
  const [requests, setRequests] = useState([]);
  const [prepRequests, setPrepRequests] = useState([]);
  const [prepId, setPrepId] = useState("");
  const [message, setMessage] = useState("");
  const { toast } = useToast();

  const load = () => {
    api.get("/kitchen/change-requests").then(({ data }) => setRequests(data));
    api.get("/kitchen/preparation-requests").then(({ data }) => setPrepRequests(data));
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!prepId || !message) return;
    try {
      await api.post("/kitchen/change-requests", { prep_request_id: prepId, message });
      toast({ title: "Change request submitted to Supervisor" });
      setMessage("");
      load();
    } catch (e) {
      toast({ title: "Failed", description: formatApiError(e), variant: "destructive" });
    }
  };

  const resolve = async (id) => {
    await api.post(`/kitchen/change-requests/${id}/resolve`);
    load();
  };

  return (
    <div data-testid="change-requests-page">
      <PageHeader title="Change Requests" description="Raise a change/issue on a preparation request to the Supervisor" />
      <Card className="bg-oat border-clay/40 mb-6">
        <CardContent className="p-4 space-y-3">
          <SearchableSelect
            options={prepRequests.map((r) => ({ value: r.id, label: `${r.ingredient_name} \u2013 ${r.machine_label}` }))}
            value={prepId}
            onChange={setPrepId}
            placeholder="Select Preparation Request"
            testId="change-request-prep-select"
          />
          <Textarea placeholder="Describe the issue or requested change..." value={message} onChange={(e) => setMessage(e.target.value)} data-testid="change-request-message-input" className="bg-bone" />
          <Button onClick={submit} data-testid="change-request-submit-btn" disabled={!prepId || !message} className="bg-beet hover:bg-beet-hover text-bone">
            Submit Change Request
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {requests.map((r) => (
          <Card key={r.id} className="bg-oat border-clay/40" data-testid={`change-request-card-${r.id}`}>
            <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm text-ink">{r.message}</p>
                <p className="text-xs text-ink/60 font-mono">{new Date(r.created_at).toLocaleString()} &middot; {r.raised_by}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={r.status} />
                {r.status === "Open" && <Button size="sm" variant="outline" onClick={() => resolve(r.id)} data-testid={`resolve-change-request-${r.id}`}>Mark Resolved</Button>}
              </div>
            </CardContent>
          </Card>
        ))}
        {requests.length === 0 && <p className="text-sm text-ink/60" data-testid="change-requests-empty">No change requests raised yet.</p>}
      </div>
    </div>
  );
}
