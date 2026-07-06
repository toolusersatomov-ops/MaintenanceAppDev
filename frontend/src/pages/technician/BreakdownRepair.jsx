import React, { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import WorkOrderCard from "@/components/technician/WorkOrderCard";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

export default function BreakdownRepair() {
  const { user } = useAuth();
  const [wos, setWos] = useState([]);

  const load = useCallback(() => {
    api.get(`/maintenance/work-orders?technician=${user.username}`).then(({ data }) => setWos(data.filter((w) => w.type === "Breakdown" && w.status !== "Closed")));
  }, [user.username]);
  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="breakdown-repair-page">
      <PageHeader title="Breakdown Repair" description="Active breakdown work orders requiring repair" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {wos.map((wo) => <WorkOrderCard key={wo.id} wo={wo} onRefresh={load} />)}
        {wos.length === 0 && <p className="text-sm text-ink/60" data-testid="breakdown-repair-empty">No active breakdown repairs.</p>}
      </div>
    </div>
  );
}
