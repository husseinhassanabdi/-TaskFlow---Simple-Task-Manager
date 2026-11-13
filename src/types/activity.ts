export type TaskActivityType = "created" | "updated" | "completed" | "deleted";

export type TaskActivity = {
  id: string;
  type: TaskActivityType;
  taskTitle: string;
  createdAt: string;
};
