import "@/App.css";
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth, ROLE_HOME } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/toaster";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Login from "@/pages/Login";

import KitchenDashboard from "@/pages/kitchen/Dashboard";
import PreparationRequests from "@/pages/kitchen/PreparationRequests";
import BinFilling from "@/pages/kitchen/BinFilling";
import BinStorage from "@/pages/kitchen/BinStorage";
import ScannedBinHistory from "@/pages/kitchen/ScannedBinHistory";
import ChangeRequests from "@/pages/kitchen/ChangeRequests";
import CleaningBins from "@/pages/kitchen/CleaningBins";
import KitchenNotifications from "@/pages/kitchen/Notifications";

import OpsDashboard from "@/pages/operations/Dashboard";
import AssignedMachines from "@/pages/operations/AssignedMachines";
import PickupList from "@/pages/operations/PickupList";
import BinReplacementTasks from "@/pages/operations/BinReplacementTasks";
import Bins from "@/pages/operations/Bins";
import DoorControl from "@/pages/operations/DoorControl";
import Cleaning from "@/pages/operations/Cleaning";
import DirtyBinReturn from "@/pages/operations/DirtyBinReturn";
import ReplacementHistory from "@/pages/operations/ReplacementHistory";
import OpsNotifications from "@/pages/operations/Notifications";

import SupDashboard from "@/pages/supervisor/Dashboard";
import MachineControlCenter from "@/pages/supervisor/MachineControlCenter";
import Alerts from "@/pages/supervisor/Alerts";
import PreScheduleTasks from "@/pages/supervisor/PreScheduleTasks";
import PreScheduleBulk from "@/pages/supervisor/PreScheduleBulk";
import TaskAssignment from "@/pages/supervisor/TaskAssignment";
import LiveTaskProgress from "@/pages/supervisor/LiveTaskProgress";
import KitchenPreparationStatus from "@/pages/supervisor/KitchenPreparationStatus";
import OperationsStaffTasks from "@/pages/supervisor/OperationsStaffTasks";
import SupReports from "@/pages/supervisor/Reports";
import UserAccessManagement from "@/pages/supervisor/UserAccessManagement";

import TechDashboard from "@/pages/technician/Dashboard";
import TechWorkOrders from "@/pages/technician/WorkOrders";
import TechDiagnostics from "@/pages/technician/Diagnostics";
import TechPreventiveMaintenance from "@/pages/technician/PreventiveMaintenance";
import BreakdownRepair from "@/pages/technician/BreakdownRepair";
import PartsReplacement from "@/pages/technician/PartsReplacement";
import CalibrationTesting from "@/pages/technician/CalibrationTesting";
import DoorPanelAccess from "@/pages/technician/DoorPanelAccess";
import SparePartsRequest from "@/pages/technician/SparePartsRequest";
import TechHistory from "@/pages/technician/History";
import TechNotifications from "@/pages/technician/Notifications";

import MSDashboard from "@/pages/maintSup/Dashboard";
import TechnicalAlerts from "@/pages/maintSup/TechnicalAlerts";
import MSWorkOrders from "@/pages/maintSup/WorkOrders";
import AssignTechnician from "@/pages/maintSup/AssignTechnician";
import PMPlanner from "@/pages/maintSup/PMPlanner";
import MachineHealth from "@/pages/maintSup/MachineHealth";
import TechnicianWorkload from "@/pages/maintSup/TechnicianWorkload";
import SparePartsInventory from "@/pages/maintSup/SparePartsInventory";
import SparePartsApprovals from "@/pages/maintSup/SparePartsApprovals";
import MSReports from "@/pages/maintSup/Reports";
import Escalations from "@/pages/maintSup/Escalations";
import MSNotifications from "@/pages/maintSup/Notifications";

import AdminDashboard from "@/pages/admin/Dashboard";
import UserManagement from "@/pages/admin/UserManagement";
import RolePermissions from "@/pages/admin/RolePermissions";
import MachineMaster from "@/pages/admin/MachineMaster";
import IngredientMaster from "@/pages/admin/IngredientMaster";
import RecipeMaster from "@/pages/admin/RecipeMaster";
import MaintenanceMaster from "@/pages/admin/MaintenanceMaster";
import SparePartsMaster from "@/pages/admin/SparePartsMaster";
import ReportsHub from "@/pages/admin/ReportsHub";
import AuditLogs from "@/pages/admin/AuditLogs";
import SystemSettings from "@/pages/admin/SystemSettings";
import MockDataManagement from "@/pages/admin/MockDataManagement";

function ProtectedRoute({ roles, children }) {
  const { user } = useAuth();
  if (user === undefined) {
    return <div className="min-h-screen bg-bone flex items-center justify-center text-ink">Loading...</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role] || "/login"} replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={ROLE_HOME[user.role]} replace /> : <Login />} />

      <Route element={<ProtectedRoute roles={["kitchen_staff"]}><DashboardLayout /></ProtectedRoute>}>
        <Route path="/kitchen/dashboard" element={<KitchenDashboard />} />
        <Route path="/kitchen/preparation-requests" element={<PreparationRequests />} />
        <Route path="/kitchen/bin-filling" element={<BinFilling />} />
        <Route path="/kitchen/bin-storage" element={<BinStorage />} />
        <Route path="/kitchen/scanned-bin-history" element={<ScannedBinHistory />} />
        <Route path="/kitchen/change-requests" element={<ChangeRequests />} />
        <Route path="/kitchen/cleaning-bins" element={<CleaningBins />} />
        <Route path="/kitchen/notifications" element={<KitchenNotifications />} />
      </Route>

      <Route element={<ProtectedRoute roles={["operations_staff"]}><DashboardLayout /></ProtectedRoute>}>
        <Route path="/operations/dashboard" element={<OpsDashboard />} />
        <Route path="/operations/assigned-machines" element={<AssignedMachines />} />
        <Route path="/operations/pickup-list" element={<PickupList />} />
        <Route path="/operations/bin-replacement-tasks" element={<BinReplacementTasks />} />
        <Route path="/operations/bins" element={<Bins />} />
        <Route path="/operations/door-control" element={<DoorControl />} />
        <Route path="/operations/cleaning" element={<Cleaning />} />
        <Route path="/operations/dirty-bin-return" element={<DirtyBinReturn />} />
        <Route path="/operations/replacement-history" element={<ReplacementHistory />} />
        <Route path="/operations/notifications" element={<OpsNotifications />} />
      </Route>

      <Route element={<ProtectedRoute roles={["operations_supervisor"]}><DashboardLayout /></ProtectedRoute>}>
        <Route path="/supervisor/dashboard" element={<SupDashboard />} />
        <Route path="/supervisor/machine-control-center" element={<MachineControlCenter />} />
        <Route path="/supervisor/alerts" element={<Alerts />} />
        <Route path="/supervisor/pre-schedule-tasks" element={<PreScheduleTasks />} />
        <Route path="/supervisor/pre-schedule-bulk" element={<PreScheduleBulk />} />
        <Route path="/supervisor/task-assignment" element={<TaskAssignment />} />
        <Route path="/supervisor/live-task-progress" element={<LiveTaskProgress />} />
        <Route path="/supervisor/kitchen-preparation-status" element={<KitchenPreparationStatus />} />
        <Route path="/supervisor/operations-staff-tasks" element={<OperationsStaffTasks />} />
        <Route path="/supervisor/reports" element={<SupReports />} />
        <Route path="/supervisor/user-access-management" element={<UserAccessManagement />} />
      </Route>

      <Route element={<ProtectedRoute roles={["maintenance_technician"]}><DashboardLayout /></ProtectedRoute>}>
        <Route path="/technician/dashboard" element={<TechDashboard />} />
        <Route path="/technician/work-orders" element={<TechWorkOrders />} />
        <Route path="/technician/diagnostics" element={<TechDiagnostics />} />
        <Route path="/technician/preventive-maintenance" element={<TechPreventiveMaintenance />} />
        <Route path="/technician/breakdown-repair" element={<BreakdownRepair />} />
        <Route path="/technician/parts-replacement" element={<PartsReplacement />} />
        <Route path="/technician/calibration-testing" element={<CalibrationTesting />} />
        <Route path="/technician/door-panel-access" element={<DoorPanelAccess />} />
        <Route path="/technician/spare-parts-request" element={<SparePartsRequest />} />
        <Route path="/technician/history" element={<TechHistory />} />
        <Route path="/technician/notifications" element={<TechNotifications />} />
      </Route>

      <Route element={<ProtectedRoute roles={["maintenance_supervisor"]}><DashboardLayout /></ProtectedRoute>}>
        <Route path="/maintenance-supervisor/dashboard" element={<MSDashboard />} />
        <Route path="/maintenance-supervisor/technical-alerts" element={<TechnicalAlerts />} />
        <Route path="/maintenance-supervisor/work-orders" element={<MSWorkOrders />} />
        <Route path="/maintenance-supervisor/assign-technician" element={<AssignTechnician />} />
        <Route path="/maintenance-supervisor/pm-planner" element={<PMPlanner />} />
        <Route path="/maintenance-supervisor/machine-health" element={<MachineHealth />} />
        <Route path="/maintenance-supervisor/technician-workload" element={<TechnicianWorkload />} />
        <Route path="/maintenance-supervisor/spare-parts-inventory" element={<SparePartsInventory />} />
        <Route path="/maintenance-supervisor/spare-parts-approvals" element={<SparePartsApprovals />} />
        <Route path="/maintenance-supervisor/reports" element={<MSReports />} />
        <Route path="/maintenance-supervisor/escalations" element={<Escalations />} />
        <Route path="/maintenance-supervisor/notifications" element={<MSNotifications />} />
      </Route>

      <Route element={<ProtectedRoute roles={["admin"]}><DashboardLayout /></ProtectedRoute>}>
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<UserManagement />} />
        <Route path="/admin/role-permissions" element={<RolePermissions />} />
        <Route path="/admin/machine-master" element={<MachineMaster />} />
        <Route path="/admin/ingredient-master" element={<IngredientMaster />} />
        <Route path="/admin/recipe-master" element={<RecipeMaster />} />
        <Route path="/admin/maintenance-master" element={<MaintenanceMaster />} />
        <Route path="/admin/spare-parts-master" element={<SparePartsMaster />} />
        <Route path="/admin/reports-hub" element={<ReportsHub />} />
        <Route path="/admin/audit-logs" element={<AuditLogs />} />
        <Route path="/admin/system-settings" element={<SystemSettings />} />
        <Route path="/admin/mock-data" element={<MockDataManagement />} />
      </Route>

      <Route path="/" element={user ? <Navigate to={ROLE_HOME[user.role] || "/login"} replace /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
