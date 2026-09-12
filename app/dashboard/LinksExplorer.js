"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

function buildQuery(filters, offset) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category !== "all") params.set("category", filters.category);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.view === "archived") params.set("view", filters.view);
  params.set("offset", String(offset));
  return params;
}

export default function LinksExplorer({ categories, initialFilters }) {
  const [filters, setFilters] = useState(initialFilters);
  const [qInput, setQInput] = useState(initialFilters.q);
  const [links, setLinks] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true); // 최초 1회 로딩(빈 화면)에만 사용
  const [searching, setSearching] = useState(false); // 검색/필터 변경 시 배경 로딩 표시용
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const isFirstLoadRef = useRef(true);

  // 검색어 입력은 300ms 디바운스 후 실제 필터에 반영한다.
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => (prev.q === qInput ? prev : { ...prev, q: qInput }));
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [qInput]);

  // 필터가 바뀔 때마다 첫 페이지부터 새로 불러온다. URL도 새로고침 없이 갱신한다.
  // 최초 로딩이 아니면 기존 목록을 화면에 그대로 둔 채 작은 로딩 표시만 띄운다
  // (검색어를 바꿀 때마다 목록이 통째로 사라졌다 다시 뜨면 훨씬 느리게 느껴짐).
  useEffect(() => {
    const controller = new AbortController();
    const previous = abortRef.current;
    abortRef.current = controller;
    previous?.abort();

    if (isFirstLoadRef.current) {
      setLoading(true);
    } else {
      setSearching(true);
    }

    fetch(`/api/links?${buildQuery(filters, 0).toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (abortRef.current !== controller) return; // 더 최신 요청에 의해 대체됨
        setLinks(data.links ?? []);
        setHasMore(Boolean(data.hasMore));
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("[dashboard] 링크 조회 실패", err);
      })
      .finally(() => {
        if (abortRef.current !== controller) return;
        setLoading(false);
        setSearching(false);
        isFirstLoadRef.current = false;
      });

    const params = buildQuery(filters, 0);
    params.delete("offset");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [filters]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetch(`/api/links?${buildQuery(filters, links.length).toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setLinks((prev) => [...prev, ...(data.links ?? [])]);
        setHasMore(Boolean(data.hasMore));
      })
      .catch((err) => console.error("[dashboard] 추가 로드 실패", err))
      .finally(() => setLoadingMore(false));
  }, [filters, links.length, loadingMore, hasMore]);

  // 무한 스크롤: 목록 맨 아래 sentinel이 화면에 보이면 다음 페이지를 불러온다.
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
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, is_read: nextValue } : l)));
    const fd = new FormData();
    fd.set("id", link.id);
    fd.set("nextValue", nextValue.toString());
    await toggleReadAction(fd);
  }

  async function handleToggleArchive(link) {
    // 보관 상태가 바뀌면 현재 보고 있는 뷰(전체/보관함) 기준에서 벗어나므로 목록에서 뺀다.
    setLinks((prev) => prev.filter((l) => l.id !== link.id));
    const fd = new FormData();
    fd.set("id", link.id);
    fd.set("nextValue", (!link.is_archived).toString());
    await toggleArchiveAction(fd);
  }

  async function handleDelete(link) {
    setLinks((prev) => prev.filter((l) => l.id !== link.id));
    const fd = new FormData();
    fd.set("id", link.id);
    await deleteLinkAction(fd);
  }

  const hasActiveFilter =
    Boolean(filters.q) || filters.category !== "all" || filters.status !== "all";

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-neutral-900">
          {filters.view === "archived" ? "보관함" : "저장한 링크"}
          {searching && (
            <span
              aria-label="검색 중"
              className="h-3 w-3 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-500"
            />
          )}
        </h2>
        <button
          type="button"
          onClick={() =>
            setFilters((prev) => ({
              ...prev,
              view: prev.view === "archived" ? "active" : "archived",
            }))
          }
          className="text-xs text-neutral-500 hover:underline"
        >
          {filters.view === "archived" ? "← 전체 보기" : "보관함 보기"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="text"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="제목, 요약, URL 검색"
          className="min-w-[160px] flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 transition-colors placeholder:text-neutral-400 hover:border-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
        />
        <select
          value={filters.category}
          onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
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
          value={filters.status}
          onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
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
      ) : links.length > 0 ? (
        <>
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {links.map((link) => (
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
          {loadingMore && (
            <p className="mt-4 text-center text-xs text-neutral-400">더 불러오는 중...</p>
          )}
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
