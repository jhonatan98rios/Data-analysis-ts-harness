'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getIndex, deleteSession, newId, type SessionMeta } from '@/lib/sessions';

export function SessionDrawer({
  currentId,
  open,
  onClose,
}: {
  currentId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionMeta[]>([]);

  useEffect(() => {
    if (open) getIndex().then(setSessions);
  }, [open]);

  const create = () => {
    router.push(`/${newId()}`);
    onClose();
  };

  const select = (id: string) => {
    router.push(`/${id}`);
    onClose();
  };

  const remove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  if (!open) return null;

  return (
    <>
      {/* overlay */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      <aside className="fixed left-0 top-0 bottom-0 w-72 bg-white dark:bg-neutral-900 z-50 shadow-xl flex flex-col animate-slide-in-left">
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-neutral-800">
          <h2 className="font-semibold text-slate-800 dark:text-slate-200">Sessões</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800"
            aria-label="fechar"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" className="fill-current">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
            </svg>
          </button>
        </div>

        {/* new session button */}
        <button
          onClick={create}
          className="mx-3 mt-3 px-3 py-2 text-sm font-medium bg-indigo-500 dark:bg-indigo-600 text-white rounded-lg hover:bg-indigo-600 dark:hover:bg-indigo-500 transition-colors"
        >
          + Nova sessão
        </button>

        {/* session list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {sessions.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-8">
              Nenhuma sessão ainda
            </p>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => select(s.id)}
              className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-sm transition-colors ${
                s.id === currentId
                  ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                  : 'hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {/* session icon */}
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-[10px] font-medium uppercase shrink-0">
                {(s.preview || 'N')[0]}
              </div>

              {/* preview + time */}
              <div className="flex-1 min-w-0">
                <p className="truncate text-[13px] leading-snug">
                  {s.preview || 'Nova sessão'}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {new Date(s.lastUpdate).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>

              {/* delete */}
              <button
                onClick={(e) => remove(e, s.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 shrink-0 transition-opacity"
                aria-label="excluir sessão"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" className="fill-current">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
