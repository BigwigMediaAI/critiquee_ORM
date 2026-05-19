import { useMemo, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from './ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';

/**
 * usePagination — client-side slicing helper.
 *
 * @param {Array} items — full array
 * @param {number} initialPageSize — default 10
 * @param {Array<any>} resetKeys — pass any filter values; whenever they change page resets to 1
 */
export function usePagination(items, initialPageSize = 10, resetKeys = []) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const total = items?.length || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Reset to page 1 when filters / data change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, resetKeys);

  // Clamp page if data shrinks below current page
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return (items || []).slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(page * pageSize, total);

  return {
    page,
    pageSize,
    totalPages,
    total,
    pageItems,
    startIdx,
    endIdx,
    setPage,
    setPageSize,
  };
}

/**
 * Generates a list of page numbers + ellipses.
 * E.g. [1, '…', 4, 5, 6, '…', 12]
 */
function buildPageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [];
  pages.push(1);
  if (current > 4) pages.push('…');
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 3) pages.push('…');
  pages.push(total);
  return pages;
}

/**
 * DataPagination — uniform pagination footer.
 * Renders nothing when total <= pageSize and total <= smallest size option.
 */
export default function DataPagination({
  page,
  pageSize,
  totalPages,
  total,
  startIdx,
  endIdx,
  setPage,
  setPageSize,
  pageSizeOptions = [10, 25, 50, 100],
  itemLabel = 'items',
  showPageSize = true,
  className = '',
  testIdPrefix = 'pagination',
}) {
  if (total === 0) return null;

  const pageList = buildPageList(page, totalPages);
  const goto = (n) => setPage(Math.min(Math.max(1, n), totalPages));

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border ${className}`}
      data-testid={`${testIdPrefix}-bar`}
    >
      <div className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground">{startIdx}</span>–
        <span className="font-medium text-foreground">{endIdx}</span> of{' '}
        <span className="font-medium text-foreground">{total}</span> {itemLabel}
      </div>

      <div className="flex items-center gap-2">
        {showPageSize && (
          <div className="flex items-center gap-2 mr-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">Rows</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
            >
              <SelectTrigger className="h-8 w-[72px] text-xs" data-testid={`${testIdPrefix}-page-size`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page === 1}
            onClick={() => goto(1)}
            data-testid={`${testIdPrefix}-first`}
            aria-label="First page"
          >
            <ChevronsLeft size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page === 1}
            onClick={() => goto(page - 1)}
            data-testid={`${testIdPrefix}-prev`}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </Button>

          {pageList.map((p, idx) => (
            p === '…' ? (
              <span key={`e-${idx}`} className="w-7 text-center text-muted-foreground text-sm">…</span>
            ) : (
              <Button
                key={p}
                variant={p === page ? 'default' : 'ghost'}
                size="sm"
                className="h-8 min-w-[32px] px-2 text-xs"
                onClick={() => goto(p)}
                data-testid={`${testIdPrefix}-page-${p}`}
              >
                {p}
              </Button>
            )
          ))}

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page === totalPages}
            onClick={() => goto(page + 1)}
            data-testid={`${testIdPrefix}-next`}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page === totalPages}
            onClick={() => goto(totalPages)}
            data-testid={`${testIdPrefix}-last`}
            aria-label="Last page"
          >
            <ChevronsRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
