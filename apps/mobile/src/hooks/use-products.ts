/**
 * CUENTAX Mobile — Product Hooks (TanStack React Query)
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { ProductListResponse } from '@/lib/dte-types';

const PRODUCT_KEYS = {
  all: ['products'] as const,
  lists: () => [...PRODUCT_KEYS.all, 'list'] as const,
  list: (search?: string) => [...PRODUCT_KEYS.lists(), { search }] as const,
};

/** Searchable paginated product list */
export function useProducts(search?: string) {
  return useInfiniteQuery<ProductListResponse>({
    queryKey: PRODUCT_KEYS.list(search),
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('page', String(pageParam));
      params.set('limit', '30');

      const { data } = await apiClient.get<ProductListResponse>(`/api/v1/products?${params.toString()}`);
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const totalLoaded = allPages.reduce((sum, p) => sum + p.data.length, 0);
      if (totalLoaded >= lastPage.total) return undefined;
      return allPages.length + 1;
    },
  });
}
