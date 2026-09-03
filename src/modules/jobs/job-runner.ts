export const JOB_RUNNER = 'JOB_RUNNER';

export interface JobRunner {
  run(jobId: string): Promise<void>;
}
