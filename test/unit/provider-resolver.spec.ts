import { ModelPurpose } from '../../generated/prisma/enums';
import { resolveProviderAndModel } from '../../src/modules/jobs/provider-resolve';

const now = new Date('2026-01-01T00:00:00.000Z');
const later = new Date('2026-01-02T00:00:00.000Z');

function model(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    name: 'vision-a',
    purpose: ModelPurpose.VISION,
    isActive: true,
    createdAt: now,
    ...overrides,
  };
}

function provider(
  overrides: Record<string, unknown> = {},
  models: ReturnType<typeof model>[] = [model()],
) {
  return {
    id: 'p1',
    name: 'Primary',
    isActive: true,
    priority: 1,
    createdAt: now,
    models,
    ...overrides,
  };
}

describe('resolveProviderAndModel', () => {
  it('returns NO_PROVIDER when there are no active providers', () => {
    const result = resolveProviderAndModel(
      [provider({ isActive: false })],
      ModelPurpose.VISION,
    );
    expect(result).toEqual({ ok: false, code: 'NO_PROVIDER' });
  });

  it('skips a higher-priority provider that has no matching model', () => {
    const skipped = provider({ id: 'p-high', name: 'High', priority: 1 }, [
      model({ purpose: ModelPurpose.CHAT }),
    ]);
    const chosen = provider(
      { id: 'p-low', name: 'Low', priority: 2, createdAt: later },
      [model({ id: 'm-vision', name: 'vision-b' })],
    );
    const result = resolveProviderAndModel(
      [skipped, chosen],
      ModelPurpose.VISION,
    );
    expect(result).toEqual({
      ok: true,
      provider: chosen,
      model: chosen.models[0],
    });
  });

  it('returns NO_MODEL when active providers exist but none have the purpose', () => {
    const result = resolveProviderAndModel(
      [provider({}, [model({ purpose: ModelPurpose.CHAT, isActive: true })])],
      ModelPurpose.VISION,
    );
    expect(result).toEqual({ ok: false, code: 'NO_MODEL' });
  });

  it('picks the earliest active matching model on the chosen provider', () => {
    const older = model({ id: 'older', name: 'old', createdAt: now });
    const newer = model({ id: 'newer', name: 'new', createdAt: later });
    const p = provider({ id: 'p1' }, [newer, older]);
    const result = resolveProviderAndModel([p], ModelPurpose.VISION);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model.id).toBe('older');
    }
  });

  it('orders providers by priority then createdAt', () => {
    const second = provider({ id: 'p-second', priority: 1, createdAt: later }, [
      model({ id: 'm-second' }),
    ]);
    const first = provider({ id: 'p-first', priority: 1, createdAt: now }, [
      model({ id: 'm-first' }),
    ]);
    const result = resolveProviderAndModel(
      [second, first],
      ModelPurpose.VISION,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.provider.id).toBe('p-first');
    }
  });
});
