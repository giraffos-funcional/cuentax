/**
 * CUENTAX Mobile — Contact Hooks (TanStack React Query)
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Contact, ContactListResponse } from '@/lib/dte-types';

const CONTACT_KEYS = {
  all: ['contacts'] as const,
  lists: () => [...CONTACT_KEYS.all, 'list'] as const,
  list: (search?: string) => [...CONTACT_KEYS.lists(), { search }] as const,
  detail: (id: number) => [...CONTACT_KEYS.all, 'detail', id] as const,
};

/** Searchable paginated contact list with infinite scroll */
export function useContacts(search?: string) {
  return useInfiniteQuery<ContactListResponse>({
    queryKey: CONTACT_KEYS.list(search),
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('page', String(pageParam));
      params.set('limit', '30');

      const { data } = await apiClient.get<ContactListResponse>(`/api/v1/contacts?${params.toString()}`);
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

/** Single contact detail */
export function useContact(id: number | undefined) {
  return useQuery<Contact>({
    queryKey: CONTACT_KEYS.detail(id!),
    queryFn: async () => {
      const { data } = await apiClient.get<Contact>(`/api/v1/contacts/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

/** Create contact mutation */
export function useCreateContact() {
  const queryClient = useQueryClient();

  return useMutation<Contact, Error, Omit<Contact, 'id' | 'created_at' | 'updated_at'>>({
    mutationFn: async (payload) => {
      const { data } = await apiClient.post<Contact>('/api/v1/contacts', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTACT_KEYS.lists() });
    },
  });
}

/** Update contact mutation */
export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation<Contact, Error, { id: number; data: Partial<Contact> }>({
    mutationFn: async ({ id, data: payload }) => {
      const { data } = await apiClient.put<Contact>(`/api/v1/contacts/${id}`, payload);
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: CONTACT_KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: CONTACT_KEYS.detail(variables.id) });
    },
  });
}

/** Delete contact mutation */
export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await apiClient.delete(`/api/v1/contacts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTACT_KEYS.lists() });
    },
  });
}
