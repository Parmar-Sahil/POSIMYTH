"use client";

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

interface ChatSession {
  id: string;        // The clean domain name (e.g., "example.com")
  url: string;       // The full root URL originally entered (e.g., "https://example.com/docs")
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export default function Home() {
  const [sessions, setSessions] = useState<Record<string, ChatSession>>({});
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Forms & Loading states
  const [urlInput, setUrlInput] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [isIndexing, setIsIndexing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Feedback states
  const [indexError, setIndexError] = useState<string | null>(null);
  const [indexSuccess, setIndexSuccess] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isLoaded = useRef(false);

  // Auto-scroll chat panel to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessions, activeSessionId, isGenerating]);

  // Load data from localStorage on mount (client-side only to prevent hydration mismatch)
  useEffect(() => {
    try {
      const storedSessions = localStorage.getItem('rag_chat_sessions');
      const storedActiveId = localStorage.getItem('rag_chat_active_session_id');
      
      if (storedSessions) {
        setSessions(JSON.parse(storedSessions));
      }
      if (storedActiveId) {
        setActiveSessionId(storedActiveId);
      }
    } catch (e) {
      console.error('Failed to load sessions from localStorage:', e);
    } finally {
      isLoaded.current = true;
    }
  }, []);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    if (!isLoaded.current) return;
    try {
      localStorage.setItem('rag_chat_sessions', JSON.stringify(sessions));
    } catch (e) {
      console.error('Failed to save sessions to localStorage:', e);
    }
  }, [sessions]);

  // Save activeSessionId to localStorage whenever it changes
  useEffect(() => {
    if (!isLoaded.current) return;
    try {
      if (activeSessionId) {
        localStorage.setItem('rag_chat_active_session_id', activeSessionId);
      } else {
        localStorage.removeItem('rag_chat_active_session_id');
      }
    } catch (e) {
      console.error('Failed to save activeSessionId to localStorage:', e);
    }
  }, [activeSessionId]);

  // Index site ingestion handler
  const handleIndexSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setIsIndexing(true);
    setIndexError(null);
    setIndexSuccess(null);

    try {
      console.log(`[Frontend] Fetching crawl for: ${urlInput}`);
      const response = await fetch('/api/crawl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: urlInput.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to crawl and index website.');
      }

      const domain = data.domain;
      console.log(`[Frontend] Ingestion succeeded. Domain: ${domain}`);

      // Initialize session if it does not exist
      setSessions((prev) => {
        if (prev[domain]) {
          setIndexSuccess(`Updated existing workspace for ${domain}.`);
          return prev;
        }
        setIndexSuccess(`Successfully created workspace for ${domain}.`);
        return {
          ...prev,
          [domain]: {
            id: domain,
            url: urlInput.trim(),
            messages: [],
          },
        };
      });

      // Switch to the newly indexed workspace
      setActiveSessionId(domain);
      setUrlInput('');
    } catch (err: any) {
      console.error('[Frontend Ingestion Error]', err);
      setIndexError(err.message || 'An unexpected error occurred during ingestion.');
    } finally {
      setIsIndexing(false);
    }
  };

  // Submit chat prompt handler
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !activeSessionId || isGenerating) return;

    const userText = messageInput.trim();
    setMessageInput('');
    setChatError(null);

    // Append user message directly to the active session
    setSessions((prev) => {
      const activeSession = prev[activeSessionId];
      if (!activeSession) return prev;
      return {
        ...prev,
        [activeSessionId]: {
          ...activeSession,
          messages: [
            ...activeSession.messages,
            { role: 'user', content: userText },
          ],
        },
      };
    });

    setIsGenerating(true);

    try {
      console.log(`[Frontend RAG] Requesting chat on domain: ${activeSessionId}`);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userText,
          domain: activeSessionId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch RAG response from server.');
      }

      const aiResponse = data.reply;

      // Append assistant message to active session
      setSessions((prev) => {
        const activeSession = prev[activeSessionId];
        if (!activeSession) return prev;
        return {
          ...prev,
          [activeSessionId]: {
            ...activeSession,
            messages: [
              ...activeSession.messages,
              { role: 'assistant', content: aiResponse },
            ],
          },
        };
      });
    } catch (err: any) {
      console.error('[Frontend RAG Error]', err);
      setChatError(err.message || 'An unexpected error occurred.');
      
      // Append error message to history for clear feedback
      setSessions((prev) => {
        const activeSession = prev[activeSessionId];
        if (!activeSession) return prev;
        return {
          ...prev,
          [activeSessionId]: {
            ...activeSession,
            messages: [
              ...activeSession.messages,
              { role: 'assistant', content: `❌ **Error:** ${err.message || 'Connection lost. Please try again.'}` },
            ],
          },
        };
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Clear current active session chat history
  const handleClearHistory = () => {
    if (!activeSessionId) return;
    setSessions((prev) => {
      const activeSession = prev[activeSessionId];
      if (!activeSession) return prev;
      return {
        ...prev,
        [activeSessionId]: {
          ...activeSession,
          messages: [],
        },
      };
    });
    setChatError(null);
  };

  const activeSession = activeSessionId ? sessions[activeSessionId] : null;
  const activeSessionList = Object.values(sessions);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans relative">
      
      {/* Mobile Sidebar Backdrop Overlay */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="md:hidden fixed inset-0 bg-black/60 z-30 transition-opacity duration-300"
        />
      )}

      {/* 1. Left Sidebar Workspace Selector */}
      <aside className={`flex flex-col border-r border-zinc-800 bg-zinc-900 md:bg-zinc-900/50 backdrop-blur-md shrink-0 transition-all duration-300 overflow-hidden h-full z-40 md:relative absolute top-0 bottom-0 left-0 ${
        isSidebarOpen ? 'w-80' : 'w-0 border-r-0'
      }`}>
        
        {/* Sidebar Header / Logo */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="font-semibold text-zinc-100 tracking-tight leading-none text-base">Grounding Engine</h1>
              <span className="text-xs text-zinc-500 font-medium">Isolated Multi-Session RAG</span>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1.5 rounded-lg hover:bg-zinc-800 cursor-pointer"
            aria-label="Close sidebar"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Index Site Form */}
        <div className="p-4 border-b border-zinc-800/80 bg-zinc-900/20">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Ingest New Website</h2>
          <form onSubmit={handleIndexSite} className="flex flex-col gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="https://example.com/docs"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                disabled={isIndexing}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={isIndexing || !urlInput.trim()}
              className="w-full h-9 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 text-white font-medium text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-lg shadow-violet-600/10 disabled:cursor-not-allowed"
            >
              {isIndexing ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Crawling Site...</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Index Site</span>
                </>
              )}
            </button>
          </form>

          {/* Feedback toasts */}
          {indexError && (
            <div className="mt-3 p-2.5 rounded-lg border border-red-900/50 bg-red-950/20 text-xs text-red-400 flex gap-2">
              <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{indexError}</span>
            </div>
          )}

          {indexSuccess && (
            <div className="mt-3 p-2.5 rounded-lg border border-emerald-900/50 bg-emerald-950/20 text-xs text-emerald-400 flex gap-2">
              <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{indexSuccess}</span>
            </div>
          )}
        </div>

        {/* Scrollable Workspaces List */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Indexed Websites</h2>
          {activeSessionList.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center text-zinc-600 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/10">
              <svg className="h-8 w-8 text-zinc-700 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="text-xs font-medium">No workspaces configured yet.</span>
            </div>
          ) : (
            activeSessionList.map((session) => {
              const isActive = session.id === activeSessionId;
              const lastMsg = session.messages[session.messages.length - 1];
              return (
                <button
                  key={session.id}
                  onClick={() => {
                    setActiveSessionId(session.id);
                    setChatError(null);
                    setIndexSuccess(null);
                    setIndexError(null);
                  }}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                    isActive
                      ? 'bg-zinc-800 border-violet-500/80 shadow-md shadow-violet-500/5 ring-1 ring-violet-500/20'
                      : 'bg-zinc-900/30 border-zinc-800 hover:bg-zinc-900/60 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-semibold text-sm text-zinc-200 truncate pr-2">{session.id}</span>
                    <span className={`h-2 w-2 rounded-full shrink-0 ${isActive ? 'bg-violet-500 animate-pulse' : 'bg-zinc-700'}`} />
                  </div>
                  <span className="text-xs text-zinc-500 truncate">{session.url}</span>
                  {lastMsg && (
                    <p className="text-[11px] text-zinc-400 truncate mt-1 border-t border-zinc-800/60 pt-1.5">
                      <span className="font-medium text-zinc-500">{lastMsg.role === 'user' ? 'You: ' : 'AI: '}</span>
                      {lastMsg.content.replace(/[#*`]/g, '')}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* 2. Main Right Chat Area */}
      <main className="flex-1 flex flex-col bg-zinc-950 overflow-hidden relative">
        {!isSidebarOpen && !activeSession && (
          <header className="h-16 border-b border-zinc-800 px-6 flex items-center bg-zinc-950 shrink-0 select-none">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="text-zinc-400 hover:text-zinc-200 transition-colors p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 cursor-pointer"
              aria-label="Open sidebar"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="ml-3 text-xs text-zinc-500 font-medium">Show Workspaces</span>
          </header>
        )}
        {activeSession ? (
          <>
            {/* Active Session Header */}
            <header className="h-16 border-b border-zinc-800 px-6 flex items-center justify-between bg-zinc-950 shrink-0">
              <div className="flex items-center gap-3 overflow-hidden">
                {!isSidebarOpen && (
                  <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="mr-1 text-zinc-400 hover:text-zinc-200 transition-colors p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 cursor-pointer shrink-0"
                    aria-label="Open sidebar"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                )}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-600/10 text-violet-400 border border-violet-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
                  Active Scope
                </span>
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <span className="font-bold text-sm text-zinc-200 truncate">{activeSession.id}</span>
                  <span className="text-zinc-600 shrink-0">•</span>
                  <a
                    href={activeSession.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-zinc-500 truncate hover:text-zinc-300 underline"
                  >
                    {activeSession.url}
                  </a>
                </div>
              </div>

              {/* Clear active session history */}
              {activeSession.messages.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clear History
                </button>
              )}
            </header>

            {/* Chat Messages Panel */}
            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6">
              {activeSession.messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto">
                  <div className="h-16 w-16 rounded-2xl bg-zinc-900 border border-zinc-800/80 flex items-center justify-center mb-4">
                    <svg className="h-8 w-8 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-lg text-zinc-200">Start a grounded chat</h3>
                  <p className="text-zinc-500 text-sm mt-2 leading-relaxed">
                    Ask any question about the documentation crawled for <strong className="text-zinc-300 font-semibold">{activeSession.id}</strong>. The pipeline will strictly retrieve facts only from this site.
                  </p>
                </div>
              ) : (
                activeSession.messages.map((msg, index) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div key={index} className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-2xl px-4 py-3.5 rounded-2xl shadow-sm text-sm leading-relaxed ${
                          isUser
                            ? 'bg-violet-600 text-white rounded-br-none shadow-violet-600/5'
                            : 'bg-zinc-900/60 border border-zinc-800/60 text-zinc-150 rounded-bl-none'
                        }`}
                      >
                        <ReactMarkdown
                          components={{
                            a: ({ node, ...props }) => (
                              <a
                                {...props}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`underline font-medium transition-colors ${isUser ? 'text-violet-200 hover:text-white' : 'text-violet-400 hover:text-violet-300'}`}
                              />
                            ),
                            p: ({ node, ...props }) => <p {...props} className="mb-2 last:mb-0" />,
                            ul: ({ node, ...props }) => <ul {...props} className="list-disc pl-5 mb-2 flex flex-col gap-1" />,
                            ol: ({ node, ...props }) => <ol {...props} className="list-decimal pl-5 mb-2 flex flex-col gap-1" />,
                            li: ({ node, ...props }) => <li {...props} className="mb-0.5" />,
                            h3: ({ node, ...props }) => <h3 {...props} className="font-semibold text-zinc-200 mt-4 mb-2 first:mt-0 text-sm border-t border-zinc-800/40 pt-3" />
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Loader bubble for AI generating state */}
              {isGenerating && (
                <div className="flex w-full justify-start">
                  <div className="bg-zinc-900/60 border border-zinc-800/60 text-zinc-150 max-w-2xl px-4 py-3 rounded-2xl rounded-bl-none flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce" />
                  </div>
                </div>
              )}

              {chatError && (
                <div className="p-3.5 rounded-xl border border-red-950/40 bg-red-950/10 text-xs text-red-400 max-w-2xl flex gap-2">
                  <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{chatError}</span>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Chat Input Bar */}
            <div className="p-6 border-t border-zinc-800/80 bg-zinc-950 shrink-0">
              <form onSubmit={handleSendMessage} className="flex gap-2 max-w-3xl mx-auto">
                <input
                  type="text"
                  placeholder={`Ask a question scope-isolated to ${activeSession.id}...`}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  disabled={isGenerating}
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition-colors disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isGenerating || !messageInput.trim()}
                  className="px-5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-900 text-white font-medium text-sm flex items-center justify-center cursor-pointer transition-colors shadow-lg shadow-violet-600/10 disabled:cursor-not-allowed"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </form>
            </div>
          </>
        ) : (
          /* Empty / Initial State Chat Panel */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto select-none">
            <div className="relative mb-6">
              {/* Core graphic with pulsing neon highlights */}
              <div className="absolute inset-0 rounded-full bg-violet-600/10 blur-2xl animate-pulse" />
              <div className="relative h-24 w-24 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-2xl">
                <svg className="h-12 w-12 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                </svg>
              </div>
            </div>
            
            <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">RAG Workspace Dashboard</h2>
            <p className="text-zinc-500 text-sm mt-3 leading-relaxed">
              ⬅️ Enter a website URL on the left sidebar to initialize a grounding space and begin chatting!
            </p>
            
            <div className="grid grid-cols-2 gap-4 mt-8 w-full border-t border-zinc-900 pt-8 text-left">
              <div className="p-4 rounded-2xl bg-zinc-900/30 border border-zinc-900 flex flex-col gap-1.5">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Polite Crawling</span>
                <span className="text-xs text-zinc-600 leading-relaxed">Respects robots.txt files, limits concurrency, and removes layout boilerplate code.</span>
              </div>
              <div className="p-4 rounded-2xl bg-zinc-900/30 border border-zinc-900 flex flex-col gap-1.5">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Multi-Tenancy Search</span>
                <span className="text-xs text-zinc-600 leading-relaxed">Scope chats strictly to individual website domains to prevent cross-origin memory leaks.</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
