import React from "react";
import NotificationsList from "@/components/shared/NotificationsList";

export default function TechNotifications() {
  return <NotificationsList endpoint="/maintenance/notifications" />;
}
