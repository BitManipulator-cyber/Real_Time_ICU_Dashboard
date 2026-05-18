import { useMemo } from "react";

export default function useQueueAnalytics(queue = []) {
  return useMemo(() => {
    const emergencies = queue.filter(
      (item) => item.isEmergency
    ).length;

    const delayed = queue.filter(
      (item) => item.status === "delayed"
    ).length;

    return {
      totalAppointments: queue.length,
      emergencies,
      delayed,
    };
  }, [queue]);
}