import { JobStatus } from '../../generated/prisma/enums';
import { FakeSuccessJobRunner } from '../../src/modules/jobs/fake-success.job-runner';

describe('FakeSuccessJobRunner', () => {
  it('claims a PENDING job then marks it COMPLETED', async () => {
    const prisma = {
      job: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    await new FakeSuccessJobRunner(prisma as never).run('job-1');

    expect(prisma.job.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-1', status: JobStatus.PENDING },
      data: { status: JobStatus.PROCESSING },
    });
    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        status: JobStatus.COMPLETED,
        output: { ok: true },
        completedAt: expect.any(Date),
      },
    });
  });

  it('skips when the job is not PENDING', async () => {
    const prisma = {
      job: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
      },
    };
    await new FakeSuccessJobRunner(prisma as never).run('job-1');
    expect(prisma.job.update).not.toHaveBeenCalled();
  });
});
