export const JOB_MAX_ATTEMPTS = 3;

const defaultQueue = process.env.BULLMQ_QUEUE ?? 'ai-jobs';

/** Jest integration tests use a separate queue so a local Docker worker cannot steal jobs. */
export const AI_JOBS_QUEUE = process.env.JEST_WORKER_ID
  ? `${defaultQueue}-test`
  : defaultQueue;
