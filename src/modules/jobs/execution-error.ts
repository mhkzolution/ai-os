export class ExecutionFailed extends Error {
  constructor(
    public readonly code: string,
    public readonly category: string,
    public readonly retryable: boolean,
    message: string,
    public readonly rawResponse?: unknown,
    public readonly vendorError?: unknown,
  ) {
    super(message);
    this.name = 'ExecutionFailed';
  }

  toJson() {
    return {
      code: this.code,
      category: this.category,
      message: this.message,
      retryable: this.retryable,
    };
  }
}
