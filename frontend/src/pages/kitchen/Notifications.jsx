import React from "react";
import NotificationsList from "@/components/shared/NotificationsList";

export default function KitchenNotifications() {
  return <NotificationsList endpoint="/kitchen/notifications" />;
}
