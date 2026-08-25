import { API_BASE_URL } from '../config';
import type {
  CreateWorldRequest,
  FoundSettlementRequest,
  IslandResponse,
  ProblemDetails,
  QueueBuildRequest,
  SettlementResponse,
  SettlementSummary,
  WorldResponse,
} from './types';

export class ApiError extends Error {
  status: number;
  problem: ProblemDetails | undefined;

  constructor(status: number, problem: ProblemDetails | undefined) {
    super(problem?.detail ?? problem?.title ?? `Request failed with status ${status}`);
    this.status = status;
    this.problem = problem;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const problem = await res.json().catch(() => undefined);
    throw new ApiError(res.status, problem);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listWorlds: () => request<WorldResponse[]>('/worlds'),
  createWorld: (body: CreateWorldRequest) =>
    request<WorldResponse>('/worlds', { method: 'POST', body: JSON.stringify(body) }),
  getWorld: (worldId: string) => request<WorldResponse>(`/worlds/${worldId}`),
  getIslands: (worldId: string) => request<IslandResponse[]>(`/worlds/${worldId}/islands`),
  foundSettlement: (worldId: string, body: FoundSettlementRequest) =>
    request<SettlementResponse>(`/worlds/${worldId}/settlements`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listSettlements: (worldId: string) =>
    request<SettlementSummary[]>(`/worlds/${worldId}/settlements`),
  getSettlement: (settlementId: string) =>
    request<SettlementResponse>(`/settlements/${settlementId}`),
  queueBuild: (settlementId: string, body: QueueBuildRequest) =>
    request<unknown>(`/settlements/${settlementId}/builds`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
