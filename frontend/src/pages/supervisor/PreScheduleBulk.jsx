import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

export default function PreScheduleBulk() {
  const [machines, setMachines] = useState([]);
  const [machineId, setMachineId] = useState("");
  const [data, setData] = useState({ grouped: { Liquid: [], Powder: [], Solid: [], Other: [] } });
  const [ingredients, setIngredients] = useState([]);
  const [popupSlot, setPopupSlot] = useState(null);
  const [popupIngredient, setPopupIngredient] = useState("");
  const [cart, setCart] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [staff, setStaff] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    api.get("/catalog/machines").then(({ data }) => { setMachines(data); if (data.length) setMachineId(data[0].id); });
    api.get("/catalog/ingredients").then(({ data }) => setIngredients(data));
    api.get("/supervisor/users").then(({ data }) => setStaffOptions(data.filter((u) => u.role === "operations_staff").map((u) => ({ value: u.username, label: `${u.name} (${u.username})` }))));
  }, []);

  useEffect(() => {
    if (!machineId) return;
    api.get(`/catalog/machines/${machineId}/slots`).then(({ data }) => setData(data));
    setCart([]);
  }, [machineId]);

  const openPopup = (slot) => { setPopupSlot(slot); setPopupIngredient(slot.ingredient_code); };

  const addToCart = () => {
    const ing = ingredients.find((i) => i.code === popupIngredient);
    setCart((c) => [...c, { slot_id: popupSlot.id, ingredient_code: popupIngredient, ingredient_name: ing?.name, machine_label: popupSlot.machine_label }]);
    setPopupSlot(null);
  };

  const selectAllLowStock = () => {
    const flagged = Object.values(data.grouped).flat().filter((s) => s.status !== "Normal");
    const items = flagged.map((s) => ({ slot_id: s.id, ingredient_code: s.ingredient_code, ingredient_name: s.ingredient_name, machine_label: s.machine_label }));
    setCart((c) => [...c, ...items]);
    toast({ title: `Added ${items.length} low-stock item(s) to cart` });
  };

  const removeFromCart = (idx) => setCart((c) => c.filter((_, i) => i !== idx));

  const placeOrder = async () => {
    try {
      const { data } = await api.post("/alerts/pre-schedule/bulk", {
        machine_id: machineId, operations_staff: staff,
        items: cart.map((c) => ({ slot_id: c.slot_id, ingredient_code: c.ingredient_code })),
      });
      toast({ title: data.message });
      setCart([]);
    } catch (e) {
      toast({ title: "Failed to place order", description: formatApiError(e), variant: "destructive" });
    }
  };

  const sameCategoryIngredients = popupSlot ? ingredients.filter((i) => i.category === popupSlot.slot_type) : [];

  return (
    <div data-testid="pre-schedule-bulk-page">
      <PageHeader
        title="Pre-Schedule Bulk Replacements"
        description="Select multiple slots to build a machine-wide reschedule cart"
        actions={<Button variant="outline" onClick={selectAllLowStock} data-testid="select-all-low-stock-btn">Select All Low Stock Items</Button>}
      />
      <div className="max-w-md mb-4">
        <SearchableSelect options={machines.map((m) => ({ value: m.id, label: m.label }))} value={machineId} onChange={setMachineId} testId="bulk-machine-select" />
      </div>

      {["Liquid", "Powder", "Solid", "Other"].map((cat) => (
        <div key={cat} className="mb-6">
          <h3 className="font-display font-semibold text-ink mb-2">{cat}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(data.grouped[cat] || []).map((s) => (
              <button key={s.id} onClick={() => openPopup(s)} data-testid={`bulk-slot-${s.id}`} className="text-left bg-oat border border-clay/40 hover:bg-stone/40 rounded-lg p-3">
                <div className="flex justify-between items-start mb-1">
                  <p className="text-sm font-semibold text-ink truncate">{s.ingredient_name}</p>
                  <StatusBadge status={s.status} />
                </div>
                <p className="text-xs font-mono text-ink/60">{s.current_level_pct}% remaining</p>
              </button>
            ))}
          </div>
        </div>
      ))}

      <Dialog open={!!popupSlot} onOpenChange={(v) => !v && setPopupSlot(null)}>
        <DialogContent className="bg-bone" data-testid="bulk-slot-popup">
          <DialogHeader><DialogTitle>Add {popupSlot?.slot_code} to Cart</DialogTitle></DialogHeader>
          <SearchableSelect
            options={sameCategoryIngredients.map((i) => ({ value: i.code, label: i.name }))}
            value={popupIngredient} onChange={setPopupIngredient} testId="bulk-popup-ingredient-select"
          />
          <Button onClick={addToCart} data-testid="bulk-popup-add-btn" className="bg-beet hover:bg-beet-hover text-bone">Add to Cart</Button>
        </DialogContent>
      </Dialog>

      <Card className="bg-oat border-beet/40 sticky bottom-4" data-testid="bulk-cart">
        <CardContent className="p-4">
          <p className="font-display font-semibold text-ink mb-2">Reschedule Cart ({cart.length})</p>
          <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
            {cart.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm bg-bone rounded px-2 py-1" data-testid={`cart-item-${idx}`}>
                <span>{item.ingredient_name} &middot; {item.slot_id}</span>
                <button onClick={() => removeFromCart(idx)} data-testid={`cart-remove-${idx}`}><Trash2 className="h-4 w-4 text-beet" /></button>
              </div>
            ))}
            {cart.length === 0 && <p className="text-sm text-ink/60" data-testid="bulk-cart-empty">Cart is empty. Click slots above to add items.</p>}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="w-64"><SearchableSelect options={staffOptions} value={staff} onChange={setStaff} placeholder="Assign Operations Staff" testId="bulk-staff-select" /></div>
            <Button disabled={!cart.length || !staff} onClick={placeOrder} data-testid="place-bulk-order-btn" className="bg-beet hover:bg-beet-hover text-bone">
              Place Pre-Scheduled Bulk Order
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
