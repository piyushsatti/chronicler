export interface Stoppable {
  name: string;
  stop(deadlineAt: number): Promise<void>;
}

/** Run each stoppable in order, sharing one deadline. */
export async function stopInOrder(
  items: readonly Stoppable[],
  deadlineAt: number,
): Promise<void> {
  for (const item of items) {
    await item.stop(deadlineAt);
  }
}
