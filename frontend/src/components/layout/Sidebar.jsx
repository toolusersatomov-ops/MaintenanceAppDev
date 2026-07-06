import React from "react";
import {
  LayoutDashboard, AlertTriangle, CalendarClock, ListChecks, Activity, ChefHat, Users, FileBarChart,
  Boxes, Warehouse, History, MessageSquareWarning, Sparkles, Bell, Truck, DoorOpen, Recycle, ClipboardList,
  Wrench, Stethoscope, ShieldCheck, HardHat, PackageSearch, PackagePlus, Settings, ShieldAlert, ScrollText,
  Database, UserCog, Cog, LogOut, Menu,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth, ROLE_LABELS } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const MENUS = {
  kitchen_staff: [
    { label: "Dashboard", path: "/kitchen/dashboard", icon: LayoutDashboard },
    { label: "Preparation Requests", path: "/kitchen/preparation-requests", icon: ClipboardList },
    { label: "Bin Filling", path: "/kitchen/bin-filling", icon: ChefHat },
    { label: "Bin Storage", path: "/kitchen/bin-storage", icon: Warehouse },
    { label: "Scanned Bin History", path: "/kitchen/scanned-bin-history", icon: History },
    { label: "Change Requests", path: "/kitchen/change-requests", icon: MessageSquareWarning },
    { label: "Cleaning Bins", path: "/kitchen/cleaning-bins", icon: Sparkles },
    { label: "Notifications", path: "/kitchen/notifications", icon: Bell },
  ],
  operations_staff: [
    { label: "Dashboard", path: "/operations/dashboard", icon: LayoutDashboard },
    { label: "Assigned Machines", path: "/operations/assigned-machines", icon: Boxes },
    { label: "Pickup List", path: "/operations/pickup-list", icon: Truck },
    { label: "Bin Replacement Tasks", path: "/operations/bin-replacement-tasks", icon: Recycle },
    { label: "Bins", path: "/operations/bins", icon: Warehouse },
    { label: "Door Control", path: "/operations/door-control", icon: DoorOpen },
    { label: "Cleaning & Sanitization", path: "/operations/cleaning", icon: Sparkles },
    { label: "Dirty Bin Return", path: "/operations/dirty-bin-return", icon: Recycle },
    { label: "Replacement History", path: "/operations/replacement-history", icon: History },
    { label: "Notifications", path: "/operations/notifications", icon: Bell },
  ],
  operations_supervisor: [
    { label: "Dashboard", path: "/supervisor/dashboard", icon: LayoutDashboard },
    { label: "Machine Control Center", path: "/supervisor/machine-control-center", icon: Cog },
    { label: "Alerts", path: "/supervisor/alerts", icon: AlertTriangle },
    { label: "Pre-Schedule Tasks", path: "/supervisor/pre-schedule-tasks", icon: CalendarClock },
    { label: "Pre-Schedule Bulk Replacements", path: "/supervisor/pre-schedule-bulk", icon: PackagePlus },
    { label: "Task Assignment", path: "/supervisor/task-assignment", icon: ListChecks },
    { label: "Live Task Progress", path: "/supervisor/live-task-progress", icon: Activity },
    { label: "Kitchen Preparation Status", path: "/supervisor/kitchen-preparation-status", icon: ChefHat },
    { label: "Operations Staff Tasks", path: "/supervisor/operations-staff-tasks", icon: HardHat },
    { label: "Reports", path: "/supervisor/reports", icon: FileBarChart },
    { label: "User & Access Management", path: "/supervisor/user-access-management", icon: Users },
  ],
  maintenance_technician: [
    { label: "Dashboard", path: "/technician/dashboard", icon: LayoutDashboard },
    { label: "Assigned Work Orders", path: "/technician/work-orders", icon: ClipboardList },
    { label: "Machine Diagnostics", path: "/technician/diagnostics", icon: Stethoscope },
    { label: "Preventive Maintenance", path: "/technician/preventive-maintenance", icon: ShieldCheck },
    { label: "Breakdown Repair", path: "/technician/breakdown-repair", icon: Wrench },
    { label: "Parts Replacement", path: "/technician/parts-replacement", icon: PackageSearch },
    { label: "Calibration & Testing", path: "/technician/calibration-testing", icon: Settings },
    { label: "Door / Panel Access", path: "/technician/door-panel-access", icon: DoorOpen },
    { label: "Spare Parts Request", path: "/technician/spare-parts-request", icon: PackagePlus },
    { label: "Maintenance History", path: "/technician/history", icon: History },
    { label: "Notifications", path: "/technician/notifications", icon: Bell },
  ],
  maintenance_supervisor: [
    { label: "Dashboard", path: "/maintenance-supervisor/dashboard", icon: LayoutDashboard },
    { label: "Technical Alerts", path: "/maintenance-supervisor/technical-alerts", icon: ShieldAlert },
    { label: "Work Orders", path: "/maintenance-supervisor/work-orders", icon: ClipboardList },
    { label: "Assign Technician", path: "/maintenance-supervisor/assign-technician", icon: UserCog },
    { label: "Preventive Maintenance Planner", path: "/maintenance-supervisor/pm-planner", icon: ShieldCheck },
    { label: "Machine Health Center", path: "/maintenance-supervisor/machine-health", icon: Activity },
    { label: "Technician Workload", path: "/maintenance-supervisor/technician-workload", icon: HardHat },
    { label: "Spare Parts Inventory", path: "/maintenance-supervisor/spare-parts-inventory", icon: Boxes },
    { label: "Spare Parts Approvals", path: "/maintenance-supervisor/spare-parts-approvals", icon: PackageSearch },
    { label: "Maintenance Reports", path: "/maintenance-supervisor/reports", icon: FileBarChart },
    { label: "Escalations", path: "/maintenance-supervisor/escalations", icon: MessageSquareWarning },
    { label: "Notifications", path: "/maintenance-supervisor/notifications", icon: Bell },
  ],
  admin: [
    { label: "Admin Dashboard", path: "/admin/dashboard", icon: LayoutDashboard },
    { label: "User & Access Management", path: "/admin/users", icon: Users },
    { label: "Role Permissions", path: "/admin/role-permissions", icon: ShieldCheck },
    { label: "Machine Master", path: "/admin/machine-master", icon: Cog },
    { label: "Ingredient Master", path: "/admin/ingredient-master", icon: Boxes },
    { label: "Recipe Master", path: "/admin/recipe-master", icon: ChefHat },
    { label: "Maintenance Master", path: "/admin/maintenance-master", icon: Wrench },
    { label: "Spare Parts Master", path: "/admin/spare-parts-master", icon: PackageSearch },
    { label: "Reports Hub", path: "/admin/reports-hub", icon: FileBarChart },
    { label: "Audit Logs", path: "/admin/audit-logs", icon: ScrollText },
    { label: "System Settings", path: "/admin/system-settings", icon: Settings },
    { label: "Mock Data Management", path: "/admin/mock-data", icon: Database },
  ],
};

export default function Sidebar({ mobileOpen, setMobileOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = MENUS[user?.role] || [];

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} data-testid="sidebar-overlay" />
      )}
      <aside
        className={cn(
          "fixed lg:sticky top-0 left-0 h-screen w-72 bg-oat border-r border-stone flex flex-col z-50 transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        data-testid="app-sidebar"
      >
        <div className="p-5 border-b border-stone">
          <p className="font-display text-lg font-bold text-ink">Protein Hulk</p>
          <p className="text-xs text-ink/60">Maintenance App</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              data-testid={`sidebar-link-${item.label.toLowerCase().replace(/[\s/&]+/g, "-")}`}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive ? "bg-bone border-l-4 border-beet text-beet" : "text-ink hover:bg-bone/70"
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-stone">
          <div className="px-2 pb-2">
            <p className="text-sm font-semibold text-ink truncate">{user?.name}</p>
            <p className="text-xs text-ink/60">{ROLE_LABELS[user?.role]}</p>
          </div>
          <button
            onClick={handleLogout}
            data-testid="sidebar-logout-btn"
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-beet hover:bg-beet/10 transition-colors"
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </aside>
    </>
  );
}

export { MENUS };
