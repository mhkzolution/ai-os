import { ModelPurpose } from '../../../generated/prisma/enums';

export type ResolveOk<P, M> = { ok: true; provider: P; model: M };
export type ResolveErr = { ok: false; code: 'NO_PROVIDER' | 'NO_MODEL' };
export type ResolveResult<P, M> = ResolveOk<P, M> | ResolveErr;

export class ProviderResolveError extends Error {
  readonly category = 'CONFIG';
  readonly retryable = false;

  constructor(public readonly code: 'NO_PROVIDER' | 'NO_MODEL') {
    super(code);
    this.name = 'ProviderResolveError';
  }
}

export function pickModel<
  M extends { isActive: boolean; purpose: ModelPurpose; createdAt: Date },
>(models: M[], purpose: ModelPurpose): M | undefined {
  return models
    .filter((model) => model.isActive && model.purpose === purpose)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
}

export function resolveProviderAndModel<
  M extends { isActive: boolean; purpose: ModelPurpose; createdAt: Date },
  P extends {
    isActive: boolean;
    priority: number;
    createdAt: Date;
    models: M[];
  },
>(providers: P[], purpose: ModelPurpose): ResolveResult<P, M> {
  const active = providers
    .filter((provider) => provider.isActive)
    .sort(
      (a, b) =>
        a.priority - b.priority || a.createdAt.getTime() - b.createdAt.getTime(),
    );
  if (active.length === 0) {
    return { ok: false, code: 'NO_PROVIDER' };
  }
  for (const provider of active) {
    const model = pickModel(provider.models, purpose);
    if (model) {
      return { ok: true, provider, model };
    }
  }
  return { ok: false, code: 'NO_MODEL' };
}
