import React from "react";
import NotificationsList from "@/components/shared/NotificationsList";

export default function MSNotifications() {
  return <NotificationsList endpoint="/maintenance/notifications" />;
}
