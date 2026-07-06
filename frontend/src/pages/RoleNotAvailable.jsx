import React from "react";
import { Info } from "lucide-react";
import { useAuth, ROLE_LABELS } from "@/context/AuthContext";

export default function RoleNotAvailable() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-bone flex items-center justify-center p-6" data-testid="role-not-available-page">
      <div className="max-w-md text-center">
        <div className="inline-flex h-14 w-14 rounded-full bg-stone/60 items-center justify-center mb-4">
          <Info className="h-7 w-7 text-ink" />
        </div>
        <h1 className="font-display text-xl font-bold text-ink mb-2">This module is not yet available.</h1>
        <p className="text-sm text-ink/60">
          You're signed in as {ROLE_LABELS[user?.role] || user?.role}. A dedicated dashboard for this role
          hasn't been built yet &mdash; please check back later or contact your Operations Supervisor.
        </p>
      </div>
    </div>
  );
}
