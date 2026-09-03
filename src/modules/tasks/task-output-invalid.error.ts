export class TaskOutputInvalidError extends Error {
  constructor(public readonly rawResponse?: unknown) {
    super('Model output did not match the task schema');
    this.name = 'TaskOutputInvalidError';
  }
}
