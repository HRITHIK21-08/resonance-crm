import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

export function useAPI<T>(key: string | string[], path: string, enabled = true) {
  return useQuery<T>({
    queryKey: Array.isArray(key) ? key : [key],
    queryFn: () => apiGet<T>(path),
    enabled,
  });
}
