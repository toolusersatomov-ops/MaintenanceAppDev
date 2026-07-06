import React, { useState, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Menu, Bell } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

const NOTIF_ENDPOINT = {
  kitchen_staff: { fetch: "/kitchen/notifications", page: "/kitchen/notifications" },
  operations_staff: { fetch: "/operations/notifications", page: "/operations/notifications" },
  operations_supervisor: { fetch: "/supervisor/notifications", page: null },
  maintenance_technician: { fetch: "/maintenance/notifications", page: "/technician/notifications" },
  maintenance_supervisor: { fetch: "/maintenance/notifications", page: "/maintenance-supervisor/notifications" },
};

export default function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const { user } = useAuth();
  const navigate = useNavigate();
  const notifCfg = NOTIF_ENDPOINT[user?.role];

  useEffect(() => {
    if (!notifCfg) return;
    let mounted = true;
    api.get(notifCfg.fetch).then(({ data }) => {
      if (mounted) setUnread((data || []).filter((n) => !n.read).length);
    }).catch(() => {});
    return () => { mounted = false; };
  }, [notifCfg]);

  return (
    <div className="min-h-screen flex bg-bone">
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-bone/95 backdrop-blur border-b border-stone flex items-center justify-between px-4 py-3 lg:px-6">
          <button className="lg:hidden p-2 rounded-md hover:bg-oat" onClick={() => setMobileOpen(true)} data-testid="mobile-menu-toggle">
            <Menu className="h-5 w-5 text-ink" />
          </button>
          <div className="hidden lg:block" />
          <button
            className="relative p-2 rounded-md hover:bg-oat"
            data-testid="topbar-notification-bell"
            onClick={() => notifCfg?.page && navigate(notifCfg.page)}
          >
            <Bell className="h-5 w-5 text-ink" />
            {unread > 0 && (
              <span className="absolute top-0 right-0 bg-beet text-bone text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center" data-testid="notification-unread-count">
                {unread}
              </span>
            )}
          </button>
        </header>
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
