import { useEffect, useState } from 'react';

interface UsePromiseOptions<T> {
  cacheKey?: string;
  promiseFn?: () => Promise<T>;
}

const PromiseCache = new Map<string, any>();

type PromiseState<T> =
  | {
      status: 'idle';
    }
  | {
      status: 'pending';
    }
  | {
      status: 'resolved';
      data: T;
    }
  | {
      status: 'rejected';
      error: Error;
    };

/** Simple implementation of a React hook for handling promises with caching. */
export function usePromise<T>(options: UsePromiseOptions<T>): {
  state: PromiseState<T>;
  refetch: () => void;
} {
  const [state, setState] = useState<PromiseState<T>>({ status: 'idle' });
  const [refetchKey, setRefetchKey] = useState(0);

  const hasCacheHit = PromiseCache.get(options.cacheKey || '');

  useEffect(() => {
    if (!options.promiseFn || hasCacheHit) {
      return;
    }

    let safeSetState = setState;

    safeSetState({ status: 'pending' });

    options
      .promiseFn()
      .then((data) => {
        safeSetState({ status: 'resolved', data });
        if (options.cacheKey) {
          PromiseCache.set(options.cacheKey, { status: 'resolved', data });
        }
      })
      .catch((error) => {
        safeSetState({ status: 'rejected', error });
      });

    return () => {
      safeSetState = () => {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.cacheKey, hasCacheHit, refetchKey]);

  const characterState = hasCacheHit
    ? PromiseCache.get(options.cacheKey || '')
    : state;

  return {
    state: characterState,
    refetch: () => setRefetchKey(refetchKey + 1),
  };
}
