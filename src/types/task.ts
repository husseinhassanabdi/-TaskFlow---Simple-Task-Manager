export type TaskStatus = "Pending" | "In Progress" | "Completed";
export type TaskPriority = "High" | "Medium" | "Low";
export type TaskCategory = "Design" | "Marketing" | "Work" | "Personal";

export type Task = {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
};

export type TaskFormValues = Omit<Task, "id">;
