'use client';

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MessageCircle, Send, Loader2, CircleStop, ChevronDown, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessagePart {
  type: string;
  text?: string;
  state?: string;
  toolName?: string;
}

function MessageText({ parts, isUser }: { parts: MessagePart[]; isUser: boolean }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.type === 'text' && p.text) {
          if (isUser) {
            return (
              <p key={i} className="whitespace-pre-wrap leading-relaxed">
                {p.text}
              </p>
            );
          }
          return (
            <div key={i} className="chat-md leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.text}</ReactMarkdown>
            </div>
          );
        }
        if (p.type?.startsWith('tool-')) {
          const toolName = p.type.replace(/^tool-/, '');
          if (p.state === 'output-available') {
            return (
              <div
                key={i}
                className="text-[10px] text-slate-400 italic mt-1"
                title="Tool call"
              >
                ↳ {toolName}
              </div>
            );
          }
          if (p.state === 'input-streaming' || p.state === 'input-available') {
            return (
              <div key={i} className="text-[10px] text-indigo-400 italic mt-1 flex items-center gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> đang gọi {toolName}…
              </div>
            );
          }
        }
        return null;
      })}
    </>
  );
}

const HISTORY_KEY = 'asoChatHistoryV1';
const SIZE_KEY = 'asoChatSizeV1';

interface Size {
  width: number;
  height: number;
}

const DEFAULT_SIZE: Size = { width: 420, height: 640 };
const MIN_SIZE: Size = { width: 340, height: 400 };

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [size, setSize] = useState<Size>(DEFAULT_SIZE);
  const scrollRef = useRef<HTMLDivElement>(null);
  const resizeStateRef = useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });

  // Load history + size on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      }
    } catch {
      // ignore
    }
    try {
      const rawSize = window.localStorage.getItem(SIZE_KEY);
      if (rawSize) {
        const parsed = JSON.parse(rawSize);
        if (typeof parsed?.width === 'number' && typeof parsed?.height === 'number') {
          setSize({
            width: Math.max(MIN_SIZE.width, parsed.width),
            height: Math.max(MIN_SIZE.height, parsed.height),
          });
        }
      }
    } catch {
      // ignore
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages, hydrated]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SIZE_KEY, JSON.stringify(size));
    } catch {
      // ignore
    }
  }, [size, hydrated]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status === 'streaming' || status === 'submitted') return;
    sendMessage({ text: input.trim() });
    setInput('');
  };

  const resetChat = () => {
    setMessages([]);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(HISTORY_KEY);
      } catch {
        // ignore
      }
    }
  };

  const isBusy = status === 'streaming' || status === 'submitted';

  const startResize = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizeStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: size.width,
      startH: size.height,
    };
    const onMove = (ev: globalThis.MouseEvent) => {
      const st = resizeStateRef.current;
      if (!st) return;
      // Dragging UP / LEFT = bigger (panel is anchored bottom-right)
      const dx = st.startX - ev.clientX;
      const dy = st.startY - ev.clientY;
      const maxW = Math.min(window.innerWidth - 32, 900);
      const maxH = Math.min(window.innerHeight - 120, 900);
      setSize({
        width: Math.max(MIN_SIZE.width, Math.min(maxW, st.startW + dx)),
        height: Math.max(MIN_SIZE.height, Math.min(maxH, st.startH + dy)),
      });
    };
    const onUp = () => {
      resizeStateRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const panelStyle = {
    width: `min(${size.width}px, calc(100vw - 2rem))`,
    height: `min(${size.height}px, calc(100vh - 8rem))`,
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={open ? 'Thu gọn (giữ lịch sử)' : 'Mở AI Assistant'}
        className={cn(
          'fixed right-4 z-50 rounded-full shadow-xl ring-4 ring-white grid place-items-center transition-all',
          'bottom-20 md:bottom-6',
          'h-14 px-4 bg-indigo-600 hover:bg-indigo-700 text-white gap-2',
          !open && 'hover:scale-105',
        )}
        aria-label={open ? 'Minimize chat (history kept)' : 'Open AI assistant'}
      >
        {open ? (
          <>
            <ChevronDown className="h-5 w-5" strokeWidth={2.5} />
            <span className="text-sm font-semibold">Thu gọn</span>
          </>
        ) : (
          <>
            <MessageCircle className="h-5 w-5" strokeWidth={2.5} />
            <span className="text-sm font-semibold">
              {messages.length > 0 ? 'Tiếp tục' : 'Hỏi AI'}
            </span>
          </>
        )}
      </button>

      {open && (
        <div
          style={panelStyle}
          className="fixed right-4 z-40 bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden bottom-36 md:bottom-24"
        >
          {/* Resize handle — drag from top-left corner to expand */}
          <div
            onMouseDown={startResize}
            title="Kéo để chỉnh kích thước"
            className="absolute top-0 left-0 w-5 h-5 cursor-nwse-resize z-10 grid place-items-end p-0.5 text-slate-300 hover:text-slate-500 hover:bg-slate-100/80 rounded-br-md"
          >
            <GripHorizontal className="h-3 w-3 rotate-45" />
          </div>

          <header className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white px-4 py-3 flex items-center gap-2 pl-8">
            <MessageCircle className="h-4 w-4" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">ASO Assistant</div>
              <div className="text-[10px] opacity-80">Phân tích dashboard · Gemini 2.5 Flash Lite</div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Kết thúc chat? Toàn bộ lịch sử sẽ bị xóa, không thể hoàn tác.')) {
                    resetChat();
                  }
                }}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-white/90 hover:text-white bg-rose-500/20 hover:bg-rose-500/40 px-2 py-1 rounded transition"
                title="Kết thúc chat (xóa lịch sử)"
              >
                <CircleStop className="h-3.5 w-3.5" strokeWidth={2.2} />
                <span>End chat</span>
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-white/90 hover:text-white px-2 py-1 rounded hover:bg-white/15 transition"
              title="Thu gọn (giữ lịch sử)"
            >
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.2} />
              <span>Thu gọn</span>
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-6 text-[12px] text-slate-500 space-y-2">
                <p className="font-medium text-slate-700">Hỏi gì cũng được về dashboard ASO.</p>
                <div className="space-y-1.5 text-left max-w-[280px] mx-auto mt-3">
                  {[
                    'Top 10 keyword nhiều install nhất L7',
                    'Pace ads tháng này có đạt target không?',
                    'Keyword nào tụt rank mạnh nhất gần đây?',
                    'Phân bổ users theo country L30',
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        sendMessage({ text: q });
                      }}
                      className="block w-full text-left text-[11px] px-2.5 py-1.5 rounded-md border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 text-slate-700"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'flex',
                  m.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                <div
                  className={cn(
                    'rounded-2xl px-3 py-2 text-[13px]',
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm max-w-[85%]'
                      : 'bg-slate-100 text-slate-900 rounded-bl-sm max-w-[95%]',
                  )}
                >
                  <MessageText parts={m.parts as MessagePart[]} isUser={m.role === 'user'} />
                </div>
              </div>
            ))}
            {isBusy && messages.length > 0 && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                </div>
              </div>
            )}
            {error && (
              <div className="text-[11px] text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-3 py-2">
                Lỗi: {error.message ?? 'unknown'}
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-slate-200 p-2 flex items-end gap-2 bg-white"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as unknown as FormEvent);
                }
              }}
              placeholder="Hỏi về dashboard…"
              rows={1}
              className="flex-1 resize-none text-sm px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[36px] max-h-32"
              disabled={isBusy}
            />
            <button
              type="submit"
              disabled={!input.trim() || isBusy}
              className="h-9 w-9 rounded-lg bg-indigo-600 text-white grid place-items-center hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              aria-label="Send"
            >
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
