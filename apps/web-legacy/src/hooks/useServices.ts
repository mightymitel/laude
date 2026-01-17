'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Service, ServicePlaylistItem, Key } from '@laudasist/shared';

// Types for API responses
interface ServiceListResponse {
    data: Service[];
}

interface CreateServiceInput {
    title: string;
    date?: string;
}

interface UpdateServiceInput {
    title?: string;
    date?: string;
    status?: 'edit' | 'live' | 'archived';
    playlist?: ServicePlaylistItem[];
    currentSongId?: string;
    currentPartIndex?: number;
    currentKey?: Key;
}

/**
 * Hook to list all services for the current user
 */
export function useServices(status?: string) {
    return useQuery({
        queryKey: ['services', status],
        queryFn: async () => {
            const params = status ? `?status=${status}` : '';
            const response = await apiFetch<ServiceListResponse>(`/api/services${params}`);
            return response.data;
        },
    });
}

/**
 * Hook to get a single service by ID
 */
export function useService(id: string) {
    return useQuery({
        queryKey: ['service', id],
        queryFn: async () => {
            const response = await apiFetch<Service>(`/api/services/${id}`);
            return response;
        },
        enabled: !!id,
    });
}

/**
 * Hook to create a new service
 */
export function useCreateService() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: CreateServiceInput) => {
            const response = await apiFetch<Service>('/api/services', {
                method: 'POST',
                body: JSON.stringify(input),
            });
            return response;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['services'] });
        },
    });
}

/**
 * Hook to update a service
 */
export function useUpdateService(id: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: UpdateServiceInput) => {
            const response = await apiFetch(`/api/services/${id}`, {
                method: 'PUT',
                body: JSON.stringify(input),
            });
            return response;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['service', id] });
            queryClient.invalidateQueries({ queryKey: ['services'] });
        },
    });
}

/**
 * Hook to delete a service
 */
export function useDeleteService() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            await apiFetch(`/api/services/${id}`, {
                method: 'DELETE',
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['services'] });
        },
    });
}
