"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LinkCard from "./LinkCard";
import { toggleReadAction, toggleArchiveAction, deleteLinkAction } from "./actions";

const STATUS_OPTIONS = [
  { value: "all", label: "전체 상태" },
  { value: "pending", label: "처리 중" },
  { value: "processed", label: "완료" },
  { value: "failed", label: "실패" },
  { value: "restricted", label: "비공개/제한" },
  { value: "quota_exceeded", label: "요약 한도 초과" },
];

const PAGE_SIZE = 12;

function buildQuery(source) {
  const params = new URLSearchParams();
  if (source.category !== "all") params.set("category", source.category);
  if (source.status !== "all") params.set("status", source.status);
  if (source.view === "archived") params.set("view", source.view);
  return params;
}

export default function LinksExplorer({ categories, initialFilters }) {
  // q(검색어)는 서버 요청과 무관하게 클라이언트에서만 즉시 필터링한다.
  const [source, setSource] = useState({
    category: initialFilters.category,
    status: initialFilters.status,
    view: initialFilters.view,
  });
  const [q, setQ] = useState(initialFilters.q);
  const [allLinks, setAllLinks] = useState([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true); // 최초 1회 로딩(빈 화면)에만 사용
  const [refreshing, setRefreshing] = useState(false); // 카테고리/상태 변경 시 배경 로딩 표시용
  const sentinelRef = useRef(null);
  const abortRef = useRef(null);
  const isFirstLoadRef = useRef(true);

  // 카테고리/상태/보관여부가 바뀔 때만 서버에서 다시 불러온다. 검색어는 관여하지 않는다.
  useEffect(() => {
    const controller = new AbortController();
    const previous = abortRef.current;
    abortRef.current = controller;
    previous?.abort();

    if (isFirstLoadRef.current) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    fetch(`/api/links?${buildQuery(source).toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (abortRef.current !== controller) return; // 더 최신 요청에 의해 대체됨
        setAllLinks(data.links ?? []);
        setVisibleCount(PAGE_SIZE);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("[dashboard] 링크 조회 실패", err);
      })
      .finally(() => {
        if (abortRef.current !== controller) return;
        setLoading(false);
        setRefreshing(false);
        isFirstLoadRef.current = false;
      });

    const params = buildQuery(source);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [source]);

  // 검색어 필터링은 네트워크 요청 없이 즉시 계산한다.
  const filteredLinks = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    if (!keyword) return allLinks;
    return allLinks.filter((link) =>
      [link.title, link.summary, link.raw_url]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(keyword))
    );
  }, [allLinks, q]);

  useEffect(() => {
    // 검색어가 바뀌면 스크롤 페이지도 처음부터 다시 보여준다.
    setVisibleCount(PAGE_SIZE);
  }, [q]);

  const visibleLinks = filteredLinks.slice(0, visibleCount);
  const hasMore = visibleCount < filteredLinks.length;

  const loadMore = useCallback(() => {
    if (!hasMore) return;
    setVisibleCount((prev) => prev + PAGE_SIZE);
  }, [hasMore]);

  // 무한 스크롤: 목록 맨 아래 sentinel이 화면에 보이면 더 보여준다 (로컬 데이터라 즉시 반영).
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  async function handleToggleRead(link) {
    const nextValue = !link.is_read;
    setAllLinks((prev) =>
      prev.map((l) => (l.id === link.id ? { ...l, is_read: nextValue } : l))
    );
    const fd = new FormData();
    fd.set("id", link.id);
    fd.set("nextValue", nextValue.toString());
    await toggleReadAction(fd);
  }

  async function handleToggleArchive(link) {
    // 보관 상태가 바뀌면 현재 보고 있는 뷰(전체/보관함) 기준에서 벗어나므로 목록에서 뺀다.
    setAllLinks((prev) => prev.filter((l) => l.id !== link.id));
    const fd = new FormData();
    fd.set("id", link.id);
    fd.set("nextValue", (!link.is_archived).toString());
    await toggleArchiveAction(fd);
  }

  async function handleDelete(link) {
    setAllLinks((prev) => prev.filter((l) => l.id !== link.id));
    const fd = new FormData();
    fd.set("id", link.id);
    await deleteLinkAction(fd);
  }

  const hasActiveFilter =
    Boolean(q) || source.category !== "all" || source.status !== "all";

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-neutral-900">
          {source.view === "archived" ? "보관함" : "저장한 링크"}
          {refreshing && (
            <span
              aria-label="불러오는 중"
              className="h-3 w-3 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-500"
            />
          )}
        </h2>
        <button
          type="button"
          onClick={() =>
            setSource((prev) => ({
              ...prev,
              view: prev.view === "archived" ? "active" : "archived",
            }))
          }
          className="text-xs text-neutral-500 hover:underline"
        >
          {source.view === "archived" ? "← 전체 보기" : "보관함 보기"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="제목, 요약, URL 검색"
          className="min-w-[160px] flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 transition-colors placeholder:text-neutral-400 hover:border-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
        />
        <select
          value={source.category}
          onChange={(e) => setSource((prev) => ({ ...prev, category: e.target.value }))}
          className="select-field rounded-lg border border-neutral-300 py-2 pl-3 text-sm text-neutral-700 transition-colors hover:border-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
        >
          <option value="all">전체 카테고리</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={source.status}
          onChange={(e) => setSource((prev) => ({ ...prev, status: e.target.value }))}
          className="select-field rounded-lg border border-neutral-300 py-2 pl-3 text-sm text-neutral-700 transition-colors hover:border-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-neutral-400">불러오는 중...</p>
      ) : visibleLinks.length > 0 ? (
        <>
          <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {visibleLinks.map((link) => (
              <LinkCard
                key={link.id}
                link={link}
                onToggleRead={handleToggleRead}
                onToggleArchive={handleToggleArchive}
                onDelete={handleDelete}
              />
            ))}
          </ul>
          <div ref={sentinelRef} className="h-1" />
        </>
      ) : (
        <p className="mt-6 text-sm text-neutral-400">
          {hasActiveFilter
            ? "조건에 맞는 링크가 없어요."
            : "아직 저장한 링크가 없어요. 카카오톡 챗봇에 링크를 보내보세요."}
        </p>
      )}
    </section>
  );
}
