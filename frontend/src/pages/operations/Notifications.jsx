import React from "react";
import NotificationsList from "@/components/shared/NotificationsList";

export default function OpsNotifications() {
  return <NotificationsList endpoint="/operations/notifications" />;
}
