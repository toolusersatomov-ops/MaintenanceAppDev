import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Pencil } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import SearchableSelect from "@/components/shared/SearchableSelect";
import StatusBadge from "@/components/shared/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import api, { formatApiError } from "@/lib/api";

const PRIORITIES = [{ value: "Low", label: "Low" }, { value: "Medium", label: "Medium" }, { value: "High", label: "High" }];

export default function PreScheduleBulk() {
  const [machines, setMachines] = useState([]);
  const [machineId, setMachineId] = useState("");
  const [data, setData] = useState({ grouped: { Liquid: [], Powder: [], Solid: [], Other: [] } });
  const [ingredients, setIngredients] = useState([]);
  const [popupSlot, setPopupSlot] = useState(null);
  const [editingIdx, setEditingIdx] = useState(null);
  const [popupIngredient, setPopupIngredient] = useState("");
  const [popupQty, setPopupQty] = useState("");
  const [popupPriority, setPopupPriority] = useState("Medium");
  const [popupStaff, setPopupStaff] = useState("");
  const [popupKitchenRequired, setPopupKitchenRequired] = useState(true);
  const [popupComment, setPopupComment] = useState("");
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

  const openPopup = (slot) => {
    setPopupSlot(slot);
    setEditingIdx(null);
    setPopupIngredient(slot.ingredient_code);
    setPopupPriority("Medium");
    setPopupStaff("");
    setPopupKitchenRequired(true);
    setPopupComment("");
    const ing = ingredients.find((i) => i.code === slot.ingredient_code);
    setPopupQty(ing ? ing.refill_quantity_120_cups : "");
  };

  const openEdit = (item, idx) => {
    const slot = Object.values(data.grouped).flat().find((s) => s.id === item.slot_id);
    setPopupSlot(slot || { id: item.slot_id, slot_type: item.slot_type, machine_label: item.machine_label });
    setEditingIdx(idx);
    setPopupIngredient(item.ingredient_code);
    setPopupQty(item.qty);
    setPopupPriority(item.priority);
    setPopupStaff(item.operations_staff || "");
    setPopupKitchenRequired(item.kitchen_required);
    setPopupComment(item.comment || "");
  };

  useEffect(() => {
    if (!popupSlot) return;
    const ing = ingredients.find((i) => i.code === popupIngredient);
    if (ing) setPopupQty(ing.refill_quantity_120_cups);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popupIngredient]);

  const addToCart = () => {
    const ing = ingredients.find((i) => i.code === popupIngredient);
    const item = {
      slot_id: popupSlot.id, ingredient_code: popupIngredient, ingredient_name: ing?.name,
      machine_label: popupSlot.machine_label, qty: popupQty, unit: ing?.unit, priority: popupPriority,
      operations_staff: popupStaff, kitchen_required: popupKitchenRequired, comment: popupComment,
    };
    if (editingIdx !== null) {
      setCart((c) => c.map((existing, i) => (i === editingIdx ? item : existing)));
    } else {
      setCart((c) => [...c, item]);
    }
    setPopupSlot(null);
  };

  const selectAllLowStock = () => {
    const flagged = Object.values(data.grouped).flat().filter((s) => s.status !== "Normal");
    const items = flagged.map((s) => {
      const ing = ingredients.find((i) => i.code === s.ingredient_code);
      return {
        slot_id: s.id, ingredient_code: s.ingredient_code, ingredient_name: s.ingredient_name,
        machine_label: s.machine_label, qty: ing?.refill_quantity_120_cups, unit: ing?.unit,
        priority: "High", operations_staff: "", kitchen_required: true, comment: "",
      };
    });
    setCart((c) => [...c, ...items]);
    toast({ title: `Added ${items.length} low-stock item(s) to cart` });
  };

  const removeFromCart = (idx) => setCart((c) => c.filter((_, i) => i !== idx));
  const clearCart = () => setCart([]);

  const placeOrder = async () => {
    try {
      const { data } = await api.post("/alerts/pre-schedule/bulk", {
        machine_id: machineId, operations_staff: staff,
        items: cart.map((c) => ({
          slot_id: c.slot_id, ingredient_code: c.ingredient_code, priority: c.priority,
          kitchen_required: c.kitchen_required, comment: c.comment || null, operations_staff: c.operations_staff || null,
        })),
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
          <DialogHeader><DialogTitle>{editingIdx !== null ? "Edit Cart Item" : `Add ${popupSlot?.slot_code || popupSlot?.id} to Cart`}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-ink/60 mb-1 block">Replacement Ingredient</Label>
              <SearchableSelect
                options={sameCategoryIngredients.map((i) => ({ value: i.code, label: i.name }))}
                value={popupIngredient} onChange={setPopupIngredient} testId="bulk-popup-ingredient-select"
              />
            </div>
            <div>
              <Label className="text-xs text-ink/60 mb-1 block">Refill Quantity (auto-filled)</Label>
              <input readOnly value={popupQty} data-testid="bulk-popup-qty" className="w-full bg-stone/30 border border-clay/40 rounded-md px-3 py-2 text-sm text-ink font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-ink/60 mb-1 block">Priority</Label>
                <SearchableSelect options={PRIORITIES} value={popupPriority} onChange={setPopupPriority} testId="bulk-popup-priority-select" />
              </div>
              <div>
                <Label className="text-xs text-ink/60 mb-1 block">Assign Staff (optional)</Label>
                <SearchableSelect options={staffOptions} value={popupStaff} onChange={setPopupStaff} placeholder="Use cart default" testId="bulk-popup-staff-select" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="kitchen-required" checked={popupKitchenRequired} onCheckedChange={setPopupKitchenRequired} data-testid="bulk-popup-kitchen-required" />
              <Label htmlFor="kitchen-required" className="text-sm text-ink cursor-pointer">Kitchen preparation required</Label>
            </div>
            <div>
              <Label className="text-xs text-ink/60 mb-1 block">Comment</Label>
              <Textarea value={popupComment} onChange={(e) => setPopupComment(e.target.value)} data-testid="bulk-popup-comment" placeholder="Optional notes" />
            </div>
            <Button onClick={addToCart} data-testid="bulk-popup-add-btn" className="bg-beet hover:bg-beet-hover text-bone w-full">
              {editingIdx !== null ? "Save Changes" : "Add to Cart"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="bg-oat border-beet/40 sticky bottom-4" data-testid="bulk-cart">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="font-display font-semibold text-ink">Reschedule Cart ({cart.length})</p>
            {cart.length > 0 && <Button size="sm" variant="ghost" onClick={clearCart} data-testid="bulk-cart-clear-btn">Clear All</Button>}
          </div>
          <div className="space-y-1 mb-3 max-h-48 overflow-y-auto">
            {cart.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm bg-bone rounded px-2 py-1.5" data-testid={`cart-item-${idx}`}>
                <span className="truncate">
                  {item.ingredient_name} &middot; {item.slot_id} &middot; {item.qty}{item.unit} &middot; {item.priority}
                  {!item.kitchen_required && " · No Kitchen"}
                  {item.operations_staff && ` · ${item.operations_staff}`}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <button onClick={() => openEdit(item, idx)} data-testid={`cart-edit-${idx}`}><Pencil className="h-3.5 w-3.5 text-ink/60" /></button>
                  <button onClick={() => removeFromCart(idx)} data-testid={`cart-remove-${idx}`}><Trash2 className="h-4 w-4 text-beet" /></button>
                </span>
              </div>
            ))}
            {cart.length === 0 && <p className="text-sm text-ink/60" data-testid="bulk-cart-empty">Cart is empty. Click slots above to add items.</p>}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="w-64"><SearchableSelect options={staffOptions} value={staff} onChange={setStaff} placeholder="Default Operations Staff" testId="bulk-staff-select" /></div>
            <Button disabled={!cart.length || !staff} onClick={placeOrder} data-testid="place-bulk-order-btn" className="bg-beet hover:bg-beet-hover text-bone">
              Place Bulk Order
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
