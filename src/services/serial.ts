/**
 * Runs async tasks one at a time, in call order. Used for note writes so two
 * log entries started at the same moment can't race to create the same note.
 */
export class SerialRunner {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
