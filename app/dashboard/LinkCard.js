"use client";

const STATUS_LABELS = {
  pending: { label: "처리 중", className: "bg-neutral-100 text-neutral-600" },
  processed: { label: "완료", className: "bg-green-100 text-green-700" },
  failed: { label: "실패", className: "bg-red-100 text-red-700" },
  restricted: { label: "비공개/제한", className: "bg-orange-100 text-orange-700" },
  quota_exceeded: { label: "요약 한도 초과", className: "bg-purple-100 text-purple-700" },
};

export default function LinkCard({ link, onToggleRead, onToggleArchive, onDelete }) {
  const statusInfo = STATUS_LABELS[link.status] ?? STATUS_LABELS.pending;
  const displayUrl = link.resolved_url || link.raw_url;
  const displayTitle = link.title || link.raw_url;

  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white transition-shadow hover:shadow-md">
      <a href={displayUrl} target="_blank" rel="noopener noreferrer" className="block">
        {link.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- 외부 임의 도메인 썸네일이라 next/image 대신 사용
          <img
            src={link.thumbnail_url}
            alt=""
            className="aspect-video w-full object-cover"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-neutral-100 text-3xl text-neutral-300">
            🔗
          </div>
        )}
      </a>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusInfo.className}`}>
            {statusInfo.label}
          </span>
          {link.category && (
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
              {link.category}
            </span>
          )}
          {link.is_read && <span className="text-xs text-neutral-400">읽음</span>}
        </div>

        <a
          href={displayUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 break-all font-medium text-neutral-900 hover:underline"
        >
          {displayTitle}
        </a>

        {link.summary && (
          <p className="line-clamp-3 whitespace-pre-line text-sm text-neutral-600">
            {link.summary}
          </p>
        )}

        {link.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {link.tags.map((tag) => (
              <span key={tag} className="rounded bg-neutral-50 px-1.5 py-0.5 text-xs text-neutral-500">
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between border-t border-neutral-100 pt-2 text-xs text-neutral-400">
          <span className="truncate">
            {link.source_domain} · {new Date(link.created_at).toLocaleDateString("ko-KR")}
          </span>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onToggleRead(link)}
            className="text-xs text-neutral-500 hover:underline"
          >
            {link.is_read ? "읽음 해제" : "읽음 표시"}
          </button>
          <button
            type="button"
            onClick={() => onToggleArchive(link)}
            className="text-xs text-neutral-500 hover:underline"
          >
            {link.is_archived ? "보관 해제" : "보관"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("이 링크를 삭제할까요? 되돌릴 수 없어요.")) {
                onDelete(link);
              }
            }}
            className="text-xs text-red-500 hover:underline"
          >
            삭제
          </button>
        </div>
      </div>
    </li>
  );
}
