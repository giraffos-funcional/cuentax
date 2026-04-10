/**
 * CUENTAX Mobile — DTE Hooks (TanStack React Query)
 * Mirrors web SWR hooks but uses React Query for React Native.
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { downloadPDF } from '@/lib/file-utils';
import type {
  DTE,
  DTEListResponse,
  EmitirDTEPayload,
  EmitirDTEResult,
} from '@/lib/dte-types';

interface DTEFilters {
  status?: string;
  tipo_dte?: number;
  desde?: string;
  hasta?: string;
}

const DTE_KEYS = {
  all: ['dte'] as const,
  lists: () => [...DTE_KEYS.all, 'list'] as const,
  list: (filters: DTEFilters) => [...DTE_KEYS.lists(), filters] as const,
  detail: (id: number) => [...DTE_KEYS.all, 'detail', id] as const,
  status: (trackId: string) => [...DTE_KEYS.all, 'status', trackId] as const,
};

/** Paginated + infinite scroll list of DTEs with status/tipo filters */
export function useDTEs(filters: DTEFilters = {}) {
  return useInfiniteQuery<DTEListResponse>({
    queryKey: DTE_KEYS.list(filters),
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.tipo_dte) params.set('tipo_dte', String(filters.tipo_dte));
      if (filters.desde) params.set('desde', filters.desde);
      if (filters.hasta) params.set('hasta', filters.hasta);
      params.set('page', String(pageParam));
      params.set('limit', '20');

      const { data } = await apiClient.get<DTEListResponse>(`/api/v1/dte?${params.toString()}`);
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const totalLoaded = allPages.reduce((sum, p) => sum + p.data.length, 0);
      if (totalLoaded >= lastPage.total) return undefined;
      return allPages.length + 1;
    },
    staleTime: 30_000,
  });
}

/** Single DTE detail by database ID */
export function useDTE(id: number | undefined) {
  return useQuery<DTE>({
    queryKey: DTE_KEYS.detail(id!),
    queryFn: async () => {
      const { data } = await apiClient.get<DTE>(`/api/v1/dte/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

/** SII status polling — refetches every 15 seconds while trackId is truthy */
export function useDTEStatus(trackId: string | undefined) {
  return useQuery({
    queryKey: DTE_KEYS.status(trackId!),
    queryFn: async () => {
      const { data } = await apiClient.get(`/api/v1/dte/${trackId}/status`);
      return data as { status: string; glosa?: string; detail?: string };
    },
    enabled: !!trackId,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

/** Emit DTE mutation */
export function useEmitirDTE() {
  const queryClient = useQueryClient();

  return useMutation<EmitirDTEResult, Error, EmitirDTEPayload>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.post<EmitirDTEResult>('/api/v1/dte/emitir', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DTE_KEYS.lists() });
    },
  });
}

/** Download DTE PDF — returns local file URI */
export function useDTEPDF() {
  return useMutation<string, Error, { trackId: string; folio: number; tipoDte: number }>({
    mutationFn: async ({ trackId, folio, tipoDte }) => {
      const filename = `DTE-${tipoDte}-${folio}.pdf`;
      const localUri = await downloadPDF(`/api/v1/dte/${trackId}/pdf`, filename);
      return localUri;
    },
  });
}
