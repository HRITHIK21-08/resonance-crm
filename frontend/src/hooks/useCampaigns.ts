import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Campaign } from '@/lib/types';

export function useCampaigns() {
  return useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: () => apiGet<Campaign[]>('/api/campaigns'),
  });
}

export function useCampaign(id: string) {
  return useQuery<Campaign>({
    queryKey: ['campaign', id],
    queryFn: () => apiGet<Campaign>(`/api/campaigns/${id}`),
    enabled: !!id,
  });
}
