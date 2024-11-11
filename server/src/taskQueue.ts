import PQueue from "p-queue";

/**
 * A queue for running tasks with access to the task's promise
 */
export default class TaskQueue {
  private queue: PQueue;
  private taskPromises: Map<string, Promise<number>>;

  constructor() {
    this.queue = new PQueue();
    this.taskPromises = new Map();
  }

  async addTask(id: string, taskFn: () => Promise<number>): Promise<number> {
    if (this.taskPromises.has(id)) {
      return this.awaitTask(id);
    }

    const taskPromise = this.queue.add(async () => {
      const result = await taskFn();
      return result;
    }) as Promise<number>;

    this.taskPromises.set(id, taskPromise);

    try {
      const result = await taskPromise;
      return result;
    } finally {
      this.taskPromises.delete(id);
    }
  }

  hasTask(id: string): boolean {
    return this.taskPromises.has(id);
  }

  async awaitTask(id: string): Promise<number> {
    const taskPromise = this.taskPromises.get(id);
    console.log("taskPromises", this.taskPromises);
    if (!taskPromise) {
      throw new Error(`Task with id ${id} not found`);
    }
    return taskPromise;
  }
}
