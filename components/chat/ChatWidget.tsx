'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { MessageCircle, X, Send, Loader2, LockKeyhole, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

const AUTH_STORAGE_KEY = 'chatAuthToken';

function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(AUTH_STORAGE_KEY);
}

function writeToken(value: string | null) {
  if (typeof window === 'undefined') return;
  if (value === null) window.localStorage.removeItem(AUTH_STORAGE_KEY);
  else window.localStorage.setItem(AUTH_STORAGE_KEY, value);
}

interface MessagePart {
  type: string;
  text?: string;
  state?: string;
  toolName?: string;
}

function MessageText({ parts }: { parts: MessagePart[] }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.type === 'text' && p.text) {
          return (
            <p key={i} className="whitespace-pre-wrap leading-relaxed">
              {p.text}
            </p>
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

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwChecking, setPwChecking] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      headers: () => (token ? { 'x-chat-auth': token } : ({} as Record<string, string>)),
    }),
    onError: (err) => {
      const msg = err?.message ?? '';
      if (msg.includes('401') || msg.includes('invalid_password')) {
        writeToken(null);
        setToken(null);
        setUnlocked(false);
        setPwError('Password sai hoặc đã hết hạn — nhập lại.');
      }
    },
  });

  // Load token from localStorage on mount
  useEffect(() => {
    const t = readToken();
    if (t) {
      setToken(t);
      setUnlocked(true);
    }
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status]);

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pwInput.trim()) return;
    setPwChecking(true);
    setPwError(null);
    try {
      // Lightweight check: ping the chat endpoint with an empty messages list
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-chat-auth': pwInput.trim() },
        body: JSON.stringify({ messages: [] }),
      });
      if (res.status === 401) {
        setPwError('Sai password.');
        setPwChecking(false);
        return;
      }
      // 200 or any non-401 with proper token → unlock
      const t = pwInput.trim();
      writeToken(t);
      setToken(t);
      setUnlocked(true);
      setPwInput('');
    } catch {
      setPwError('Lỗi mạng. Thử lại.');
    } finally {
      setPwChecking(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status === 'streaming' || status === 'submitted') return;
    sendMessage({ text: input.trim() });
    setInput('');
  };

  const resetChat = () => {
    setMessages([]);
  };

  const signOut = () => {
    writeToken(null);
    setToken(null);
    setUnlocked(false);
    setMessages([]);
  };

  const isBusy = status === 'streaming' || status === 'submitted';

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full shadow-lg grid place-items-center transition-all',
          'bg-gradient-to-br from-indigo-500 to-violet-600 text-white hover:scale-105 hover:shadow-xl',
          open && 'rotate-180',
        )}
        aria-label={open ? 'Close chat' : 'Open chat'}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-[min(420px,calc(100vw-2rem))] h-[min(640px,calc(100vh-6rem))] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <header className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white px-4 py-3 flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">ASO Assistant</div>
              <div className="text-[10px] opacity-80">Phân tích dashboard · Claude Haiku</div>
            </div>
            {unlocked && messages.length > 0 && (
              <button
                onClick={resetChat}
                className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10"
                title="Clear chat"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            {unlocked && (
              <button
                onClick={signOut}
                className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10"
                title="Sign out"
              >
                <LockKeyhole className="h-3.5 w-3.5" />
              </button>
            )}
          </header>

          {/* Body */}
          {!unlocked ? (
            <div className="flex-1 grid place-items-center p-6">
              <form onSubmit={handlePasswordSubmit} className="w-full space-y-3">
                <div className="text-center space-y-1.5">
                  <LockKeyhole className="h-8 w-8 mx-auto text-slate-400" />
                  <div className="text-sm font-medium text-slate-900">Cần password để chat</div>
                  <div className="text-[11px] text-slate-500">
                    Liên hệ admin (Trang) để lấy password.
                  </div>
                </div>
                <input
                  type="password"
                  value={pwInput}
                  onChange={(e) => setPwInput(e.target.value)}
                  placeholder="Password"
                  className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                  disabled={pwChecking}
                />
                {pwError && (
                  <div className="text-[11px] text-rose-600 text-center">{pwError}</div>
                )}
                <button
                  type="submit"
                  disabled={!pwInput.trim() || pwChecking}
                  className="w-full h-9 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {pwChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Mở khóa
                </button>
              </form>
            </div>
          ) : (
            <>
              {/* Messages */}
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
                        'max-w-[85%] rounded-2xl px-3 py-2 text-[13px]',
                        m.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-br-sm'
                          : 'bg-slate-100 text-slate-900 rounded-bl-sm',
                      )}
                    >
                      <MessageText parts={m.parts as MessagePart[]} />
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

              {/* Input */}
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
            </>
          )}
        </div>
      )}
    </>
  );
}
