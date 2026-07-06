import { useEffect, useState } from "react";
import api from "@/lib/api";

export default function useAssignedMachines() {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/operations/assigned-machines").then(({ data }) => {
      setMachines(data);
      setLoading(false);
    });
  }, []);

  return { machines, loading, options: machines.map((m) => ({ value: m.id, label: m.label })) };
}
