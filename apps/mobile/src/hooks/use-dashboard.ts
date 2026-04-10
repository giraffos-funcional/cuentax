/**
 * CUENTAX Mobile — Dashboard Hooks
 * TanStack Query hooks for dashboard data.
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

interface DashboardStats {
  total_emitidos: number;
  total_aceptados: number;
  por_estado: Record<
    string,
    { count: number; total: number }
  >;
}

interface GastosStats {
  total_gastos: number;
  total_iva: number;
  total_neto: number;
  cantidad: number;
}

interface DTE {
  id: string | number;
  tipo_dte: number;
  folio: number;
  estado: string;
  monto_total: number;
  razon_social_receptor: string;
  fecha_emision: string;
}

interface DTEListResponse {
  data: DTE[];
  total: number;
}

export function useStats() {
  const { isAuthenticated } = useAuthStore();

  const query = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const { data } = await apiClient.get<DashboardStats>(
        '/api/v1/reportes/stats',
      );
      return data;
    },
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });

  return {
    stats: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useRecentDTEs(limit = 5) {
  const { isAuthenticated } = useAuthStore();

  const query = useQuery({
    queryKey: ['dashboard', 'recent-dtes', limit],
    queryFn: async () => {
      const { data } = await apiClient.get<DTEListResponse>(
        `/api/v1/dte?page=1&limit=${limit}`,
      );
      return data;
    },
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });

  return {
    documentos: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useGastosStats() {
  const { isAuthenticated } = useAuthStore();
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const query = useQuery({
    queryKey: ['dashboard', 'gastos-stats', currentMonth, currentYear],
    queryFn: async () => {
      const { data } = await apiClient.get<GastosStats>(
        `/api/v1/gastos/stats?mes=${currentMonth}&year=${currentYear}`,
      );
      return data;
    },
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });

  return {
    gastosStats: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export type { DashboardStats, GastosStats, DTE };
