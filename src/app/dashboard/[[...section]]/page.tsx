import { notFound } from "next/navigation";
import TaskFlowDashboard from "@/components/tasks/taskflow-dashboard";
import type { DashboardView } from "@/components/tasks/taskflow-dashboard";

const sectionViews: Record<string, DashboardView> = {
  tasks: "tasks",
  upcoming: "upcoming",
  completed: "completed",
  settings: "settings",
};

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = await params;
  const currentSection = section?.[0];

  if (section && section.length > 1) notFound();

  const view = currentSection ? sectionViews[currentSection] : "overview";
  if (!view) notFound();

  return <TaskFlowDashboard view={view} />;
}
