import React, { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import PageHeader from "@/components/shared/PageHeader";
import api from "@/lib/api";

export default function NotificationsList({ endpoint }) {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get(endpoint).then(({ data }) => setItems(data)); }, [endpoint]);

  return (
    <div data-testid="notifications-page">
      <PageHeader title="Notifications" description="Updates from across the app relevant to your role" />
      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-ink/60 py-6 text-center" data-testid="notifications-empty">No notifications yet.</p>}
        {items.map((n) => (
          <Card key={n.id} className="bg-oat border-clay/40" data-testid={`notification-card-${n.id}`}>
            <CardContent className="p-3 flex items-start gap-3">
              <Bell className="h-4 w-4 text-beet mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-ink">{n.title}</p>
                <p className="text-sm text-ink/70">{n.message}</p>
                <p className="text-xs text-ink/50 font-mono mt-1">{new Date(n.created_at).toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
