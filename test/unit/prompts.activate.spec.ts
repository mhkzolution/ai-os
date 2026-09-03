import { PromptsService } from '../../src/modules/prompts/prompts.service';

describe('PromptsService.activate', () => {
  it('deactivates the current active version then activates the target inside one transaction', async () => {
    const tx = {
      prompt: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({
          id: 'v2',
          key: 'PRODUCT_ANALYZER',
          version: 2,
          isActive: true,
        }),
      },
    };
    const prisma = {
      prompt: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'v2',
          key: 'PRODUCT_ANALYZER',
          version: 2,
          isActive: false,
        }),
      },
      $transaction: jest.fn(
        async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    };
    const service = new PromptsService(prisma as never);

    await service.activate('v2');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.prompt.updateMany).toHaveBeenCalledWith({
      where: { key: 'PRODUCT_ANALYZER', isActive: true, id: { not: 'v2' } },
      data: { isActive: false },
    });
    expect(tx.prompt.update).toHaveBeenCalledWith({
      where: { id: 'v2' },
      data: { isActive: true },
    });
    expect(tx.prompt.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.prompt.update.mock.invocationCallOrder[0],
    );
  });
});
