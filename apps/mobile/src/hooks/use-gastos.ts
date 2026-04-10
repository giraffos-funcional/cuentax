/**
 * CUENTAX Mobile -- Gastos (Expenses) Hooks
 * TanStack Query hooks for gastos CRUD and stats.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────

export interface Gasto {
  id: string;
  tipo_documento: string;
  numero_documento: string;
  fecha_documento: string;
  emisor_rut: string;
  emisor_razon_social: string;
  monto_neto: number;
  monto_iva: number;
  monto_total: number;
  categoria: string;
  descripcion: string;
  foto_url: string | null;
  confianza_ocr: number | null;
  verificado: boolean;
  created_at: string;
}

export interface CreateGastoDTO {
  tipo_documento: string;
  numero_documento?: string;
  fecha_documento: string;
  emisor_rut?: string;
  emisor_razon_social?: string;
  monto_neto?: number;
  monto_iva?: number;
  monto_total: number;
  categoria: string;
  descripcion?: string;
  foto_url?: string;
  datos_ocr?: Record<string, unknown>;
  confianza_ocr?: number;
}

export interface GastoStats {
  total_gastos: number;
  total_iva: number;
  total_documentos: number;
}

interface GastosFilters {
  categoria?: string;
  verificado?: string;
  mes?: string;
  year?: string;
}

interface PaginatedGastos {
  data: Gasto[];
  total: number;
  page: number;
  pages: number;
}

// ── Query Keys ─────────────────────────────────────────────

const GASTOS_KEY = ['gastos'];
const GASTOS_STATS_KEY = ['gastos-stats'];

// ── Hooks ──────────────────────────────────────────────────

/** Paginated gastos list with filters. */
export function useGastos(page = 1, filters?: GastosFilters) {
  const queryClient = useQueryClient();
  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (filters?.categoria) params.set('categoria', filters.categoria);
  if (filters?.verificado) params.set('verificado', filters.verificado);
  if (filters?.mes) params.set('mes', filters.mes);
  if (filters?.year) params.set('year', filters.year);

  const query = useQuery<PaginatedGastos>({
    queryKey: [...GASTOS_KEY, page, filters],
    queryFn: async () => {
      const { data } = await apiClient.get(`/api/v1/gastos?${params}`);
      return data;
    },
  });

  return {
    gastos: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    pages: query.data?.pages ?? 1,
    currentPage: query.data?.page ?? page,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Single gasto detail. */
export function useGasto(id: string | undefined) {
  const query = useQuery<Gasto>({
    queryKey: [...GASTOS_KEY, id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/api/v1/gastos/${id}`);
      return data;
    },
    enabled: !!id,
  });

  return {
    gasto: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Monthly stats. */
export function useGastoStats(mes?: string, year?: string) {
  const params = new URLSearchParams();
  if (mes) params.set('mes', mes);
  if (year) params.set('year', year);

  const query = useQuery<GastoStats>({
    queryKey: [...GASTOS_STATS_KEY, mes, year],
    queryFn: async () => {
      const { data } = await apiClient.get(`/api/v1/gastos/stats?${params}`);
      return data;
    },
  });

  return {
    stats: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}

/** Create a new gasto. Invalidates list on success. */
export function useCreateGasto() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (payload: CreateGastoDTO): Promise<Gasto> => {
      const { data } = await apiClient.post('/api/v1/gastos', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GASTOS_KEY });
      queryClient.invalidateQueries({ queryKey: GASTOS_STATS_KEY });
    },
  });

  return {
    createGasto: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}

/** Update an existing gasto. */
export function useUpdateGasto() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<CreateGastoDTO>;
    }): Promise<Gasto> => {
      const { data } = await apiClient.put(`/api/v1/gastos/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GASTOS_KEY });
      queryClient.invalidateQueries({ queryKey: GASTOS_STATS_KEY });
    },
  });

  return {
    updateGasto: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    error: mutation.error,
  };
}

/** Delete a gasto. */
export function useDeleteGasto() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await apiClient.delete(`/api/v1/gastos/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GASTOS_KEY });
      queryClient.invalidateQueries({ queryKey: GASTOS_STATS_KEY });
    },
  });

  return {
    deleteGasto: mutation.mutateAsync,
    isDeleting: mutation.isPending,
    error: mutation.error,
  };
}
