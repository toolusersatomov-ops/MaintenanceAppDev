import { useEffect, useState } from "react";
import api from "@/lib/api";

let metaCache = null;

export function useMeta() {
  const [meta, setMeta] = useState(metaCache);
  useEffect(() => {
    if (metaCache) return;
    api.get("/maintenance/meta").then(({ data }) => {
      metaCache = data;
      setMeta(data);
    });
  }, []);
  return meta;
}

export function useMachines() {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/maintenance/machines").then(({ data }) => {
      setMachines(data);
      setLoading(false);
    });
  }, []);
  return { machines, loading };
}

export const machineOptions = (machines) =>
  machines.map((m) => ({ value: m.machine_id, label: m.machine_label }));

export const fmt = (value) => (value ? new Date(value).toLocaleString() : "\u2014");
export const fmtDate = (value) => (value ? new Date(value).toLocaleDateString() : "\u2014");
