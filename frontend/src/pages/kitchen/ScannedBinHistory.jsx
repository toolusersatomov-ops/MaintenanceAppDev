import React, { useEffect, useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import api from "@/lib/api";

const columns = [
  { key: "created_at", label: "Date/Time", mono: true, render: (r) => new Date(r.created_at).toLocaleString() },
  { key: "username", label: "Scanned By" },
  { key: "action", label: "Action" },
  { key: "details", label: "Details", render: (r) => JSON.stringify(r.details || {}) },
];

export default function ScannedBinHistory() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/kitchen/scanned-bin-history").then(({ data }) => setRows(data)); }, []);

  return (
    <div data-testid="scanned-bin-history-page">
      <PageHeader title="Scanned Bin History" description="History of all bin QR scans performed by Kitchen" />
      <DataTable columns={columns} rows={rows} testId="scanned-bin-history-table" />
    </div>
  );
}
