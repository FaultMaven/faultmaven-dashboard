import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listDocuments as listUserDocuments,
  listAdminDocuments,
  deleteDocument as deleteUserDocument,
  deleteAdminDocument,
  KBDocument,
  AdminKBDocument,
} from '../lib/api';

export type KBScope = 'user' | 'admin';

export interface UseKBListResult<T extends KBDocument | AdminKBDocument> {
  documents: T[];
  filteredDocuments: T[];
  totalCount: number;
  loading: boolean;
  page: number;
  pageSize: number;
  search: string;
  setSearch: (value: string) => void;
  loadPage: (page: number) => Promise<void>;
  deleteById: (id: string) => Promise<void>;
}

export function useKBList(scope: KBScope, pageSize = 20): UseKBListResult<KBDocument | AdminKBDocument> {
  const [documents, setDocuments] = useState<(KBDocument | AdminKBDocument)[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const loadPage = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      try {
        if (scope === 'admin') {
          const response = await listAdminDocuments({ limit: pageSize, offset: nextPage * pageSize });
          setDocuments(response.documents);
          setTotalCount(response.total_count);
        } else {
          const response = await listUserDocuments({ limit: pageSize, offset: nextPage * pageSize });
          setDocuments(response.documents);
          setTotalCount(response.total_count);
        }
        setPage(nextPage);
      } finally {
        setLoading(false);
      }
    },
    [scope, pageSize]
  );

  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

  const deleteById = useCallback(
    async (id: string) => {
      if (scope === 'admin') {
        await deleteAdminDocument(id);
      } else {
        await deleteUserDocument(id);
      }
      await loadPage(page);
    },
    [scope, loadPage, page]
  );

  const filteredDocuments = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return documents;
    return documents.filter((doc) => {
      const tags = Array.isArray(doc.tags) ? doc.tags.join(',') : '';
      return doc.title.toLowerCase().includes(term) || tags.toLowerCase().includes(term);
    });
  }, [documents, search]);

  return {
    documents,
    filteredDocuments,
    totalCount,
    loading,
    page,
    pageSize,
    search,
    setSearch,
    loadPage,
    deleteById,
  };
}
