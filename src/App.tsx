// language: TypeScript (React), file: src/App.tsx, target: Web / Mobile Browser
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chat, Language, Message, Quota, User, UserMemories } from './types.ts';
import { Header } from './components/Header.tsx';
import { BurgerDrawer } from './components/BurgerDrawer.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { ChatStream } from './components/ChatStream.tsx';
import { ChatInput } from './components/ChatInput.tsx';
import { SelectionPopover } from './components/SelectionPopover.tsx';
import { Toast } from './components/Toast.tsx';
import { SelectionProvider, useWordSelection } from './context/SelectionContext.tsx';
import { useAudio } from './hooks/useAudio.ts';
import { useToast } from './hooks/useToast.ts';
import { haptic } from './utils/haptics.ts';
import {
  ApiError,
  checkHealth,
  generateChatTitle,
  getSessionUser,
  getWorkspace,
  logoutSession,
  saveWorkspace,
  streamChat
} from './lib/api.ts';
import { goToGoogleLogin } from './lib/auth.ts';
import {
  createAssistantMessage,
  createChat,
  createDefaultData,
  createUserMessage,
  formatResetAt,
  normalizeQuota
} from './lib/data.ts';
import { log } from './lib/logger.ts';
import { readString, storageKeys, writeString } from './lib/storage.ts';

const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
  '1070469323860-5tkdtehar2jl2ktjlfh6h9bd4k3ou6gp.apps.googleusercontent.com';

function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function isUserAbort(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError');
}

const AppContent: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return readString(storageKeys.theme) === 'light' ? 'light' : 'dark';
  });
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [data, setData] = useState(() => createDefaultData());
  const [currentLanguage, setCurrentLanguage] = useState<Language>(() => user?.currentLanguage ?? 'da');

  const [streamingContent, setStreamingContent] = useState('');
  const [streamingChatId, setStreamingChatId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [playingPhrase, setPlayingPhrase] = useState<string | undefined>();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const chatStreamRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const bootLoggedRef = useRef(false);
  const healthCheckedRef = useRef(false);

  const { toasts, showToast, dismissToast } = useToast();

  const { play, stop, isPlaying, currentSpeed } = useAudio(currentLanguage, user?.id ?? '');
  const { selection, clearSelection } = useWordSelection();

  const currentChats = useMemo(
    () =>
      data.chats
        .filter((chat) => chat.language === currentLanguage)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [data.chats, currentLanguage]
  );

  const activeChatId = useMemo(() => {
    const stored = data.activeChatId[currentLanguage];
    if (stored && currentChats.some((chat) => chat._id === stored)) return stored;
    return currentChats[0]?._id ?? null;
  }, [data.activeChatId, currentLanguage, currentChats]);

  const activeChat = currentChats.find((chat) => chat._id === activeChatId) ?? null;
  const messages = activeChatId ? data.messages[activeChatId] ?? [] : [];

  useEffect(() => {
    installTheme(theme);
    writeString(storageKeys.theme, theme);
  }, [theme]);

  useEffect(() => {
    if (!user) return;
    const timeout = window.setTimeout(() => {
      void saveWorkspace({
        theme,
        currentLanguage,
        chats: data.chats,
        messages: data.messages,
        memories: data.memories,
        quota: data.quota,
        activeChatId: data.activeChatId
      }).catch((error) => {
        log.error('workspace', 'Could not save workspace to MongoDB', { error: errorText(error) });
      });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [user, theme, currentLanguage, data]);

  useEffect(() => {
    if (!user?.id) return;

    setData((previous) => {
      if (!previous.ownerId) return { ...previous, ownerId: user.id };
      if (previous.ownerId === user.id) return previous;

      log.warn('data', 'A different account signed in; starting a separate local workspace', {
        previousOwner: previous.ownerId,
        nextOwner: user.id
      });
      return createDefaultData(user.id);
    });
  }, [user?.id]);

  useEffect(() => {
    setUser((previous) => {
      if (!previous || previous.currentLanguage === currentLanguage) return previous;
      return { ...previous, currentLanguage };
    });
  }, [currentLanguage]);

  useEffect(() => {
    const resetIfNeeded = () => {
      setData((previous) => {
        const quota = normalizeQuota(previous.quota);
        if (quota.resetAt === previous.quota.resetAt && quota.remaining === previous.quota.remaining) {
          return previous;
        }
        log.info('quota', 'Quota window reset', {
          remaining: quota.remaining,
          resetAt: quota.resetAt
        });
        return { ...previous, quota };
      });
    };

    resetIfNeeded();
    const interval = window.setInterval(resetIfNeeded, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;

    getSessionUser()
      .then(async (sessionUser) => {
        if (!active) return;
        if (!sessionUser) {
          setUser(null);
          setAuthChecked(true);
          return;
        }

        const workspace = await getWorkspace();
        if (!active) return;

        const chats = Array.isArray(workspace.chats) ? workspace.chats as Chat[] : [];
        const messages = workspace.messages && typeof workspace.messages === 'object'
          ? workspace.messages as Record<string, Message[]>
          : {};
        const memories = workspace.memories && typeof workspace.memories === 'object'
          ? workspace.memories as UserMemories
          : createDefaultData(sessionUser.id).memories;
        const quota = workspace.quota && typeof workspace.quota === 'object'
          ? normalizeQuota(workspace.quota as Partial<Quota>)
          : normalizeQuota();
        const activeChatIdValue = workspace.activeChatId && typeof workspace.activeChatId === 'object'
          ? workspace.activeChatId as Record<Language, string | null>
          : { da: null, en: null };

        setTheme(workspace.theme === 'light' ? 'light' : 'dark');
        setData({
          ownerId: sessionUser.id,
          chats,
          messages,
          words: [],
          memories,
          quota,
          activeChatId: activeChatIdValue
        });
        setCurrentLanguage(workspace.currentLanguage === 'en' ? 'en' : 'da');
        setUser({
          ...sessionUser,
          currentLanguage: workspace.currentLanguage === 'en' ? 'en' : 'da'
        });
        setAuthChecked(true);
        haptic.success();
        showToast(`Вітаємо, ${sessionUser.name.split(' ')[0]}`, 'success');
        log.info('auth', 'Mongo workspace loaded', { userId: sessionUser.id });
      })
      .catch((error) => {
        if (!active) return;
        log.error('auth', 'Google sign-in failed', { error: errorText(error) });
        setAuthChecked(true);
        showToast(`Не вдалося увійти: ${errorText(error)}`, 'warning');
      });

    return () => {
      active = false;
    };
  }, [showToast]);

  useEffect(() => {
    if (healthCheckedRef.current) return;
    healthCheckedRef.current = true;

    checkHealth()
      .then((health) => {
        log.info('api', 'Backend is online', health);
      })
      .catch((error) => {
        log.warn('api', 'Backend health check failed', { error: errorText(error) });
      });
  }, []);

  useEffect(() => {
    if (bootLoggedRef.current) return;
    bootLoggedRef.current = true;

    log.info('app', 'FastLearn booted', {
      mode: import.meta.env.DEV ? 'development' : 'production',
      language: currentLanguage,
      signedIn: Boolean(user),
      chats: data.chats.length
    });
    // Boot log intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentChats.length > 0) return;
    const chat = createChat(currentLanguage, user?.id ?? 'local');
    setData((previous) => {
      if (previous.chats.some((item) => item.language === currentLanguage)) return previous;
      return {
        ...previous,
        chats: [chat, ...previous.chats],
        messages: { ...previous.messages, [chat._id]: [] },
        activeChatId: { ...previous.activeChatId, [currentLanguage]: chat._id }
      };
    });
    log.info('data', 'Created a chat for the active language', { language: currentLanguage });
  }, [currentLanguage, currentChats.length, user?.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsDrawerOpen(false);
      setIsSettingsOpen(false);
      clearSelection();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleToggleTheme = () => {
    haptic.tap();
    setTheme((previous) => (previous === 'dark' ? 'light' : 'dark'));
    log.info('theme', 'Theme changed', { theme: theme === 'dark' ? 'light' : 'dark' });
  };

  const handleGoogleLogin = () => {
    haptic.impact();
    try {
      goToGoogleLogin(GOOGLE_CLIENT_ID);
    } catch (error) {
      log.error('auth', 'Could not start Google sign-in', { error: errorText(error) });
      showToast(errorText(error), 'warning');
    }
  };

  const handleOpenDrawer = () => {
    setIsSettingsOpen(false);
    setIsDrawerOpen(true);
  };

  const handleOpenSettings = () => {
    setIsDrawerOpen(false);
    setIsSettingsOpen(true);
  };

  const handleLogout = async () => {
    abortRef.current?.abort();
    stop();
    setPlayingPhrase(undefined);
    setStreamingContent('');
    setStreamingChatId(null);
    setIsDrawerOpen(false);
    setIsSettingsOpen(false);
    clearSelection();
    try {
      await logoutSession();
      setUser(null);
      setData(createDefaultData());
      showToast('Ви вийшли з акаунта', 'info');
      log.info('auth', 'Signed out');
    } catch (error) {
      showToast(errorText(error), 'warning');
      log.error('auth', 'Logout failed', { error: errorText(error) });
    }
  };

  const handlePlayAudio = useCallback(
    (text: string, speed = 0.80, cacheForHistory = false) => {
      if (!text.trim()) return;
      setPlayingPhrase(text);
      void play(text, speed, cacheForHistory);
    },
    [play]
  );

  const handleStopAudio = useCallback(() => {
    stop();
    setPlayingPhrase(undefined);
  }, [stop]);

  const handleSelectLanguage = (language: Language) => {
    if (language === currentLanguage) return;
    haptic.tap();
    clearSelection();
    stop();
    setPlayingPhrase(undefined);
    setCurrentLanguage(language);
    showToast(language === 'da' ? 'Мова практики: данська' : 'Мова практики: англійська', 'info');
    log.info('language', 'Practice language changed', { language });
  };

  const handleSelectChat = (chatId: string) => {
    clearSelection();
    stop();
    setPlayingPhrase(undefined);
    setData((previous) => ({
      ...previous,
      activeChatId: { ...previous.activeChatId, [currentLanguage]: chatId }
    }));
    log.debug('chat', 'Chat opened', { chatId });
  };

  const handleCreateNewChat = () => {
    setIsDrawerOpen(false);
    const activeMessages = activeChatId ? data.messages[activeChatId] ?? [] : [];
    if (activeChatId && activeMessages.length === 0) {
      log.debug('chat', 'New chat skipped: the active chat is already empty', { chatId: activeChatId });
      return;
    }

    const existingEmpty = currentChats.find((c) => (data.messages[c._id]?.length ?? 0) === 0);
    if (existingEmpty) {
      clearSelection();
      stop();
      setData((previous) => ({
        ...previous,
        activeChatId: { ...previous.activeChatId, [currentLanguage]: existingEmpty._id }
      }));
      return;
    }

    const chat = createChat(currentLanguage, user?.id ?? 'local');
    clearSelection();
    stop();
    setData((previous) => ({
      ...previous,
      chats: [chat, ...previous.chats],
      messages: { ...previous.messages, [chat._id]: [] },
      activeChatId: { ...previous.activeChatId, [currentLanguage]: chat._id }
    }));
    showToast('Створено новий діалог', 'success');
    log.info('chat', 'Chat created', { chatId: chat._id, language: currentLanguage });
  };

  const handleRenameChat = useCallback(
    (newTitle: string) => {
      if (!activeChatId) return;
      const trimmed = newTitle.trim().slice(0, 60);
      if (!trimmed) return;
      setData((previous) => ({
        ...previous,
        chats: previous.chats.map((chat) =>
          chat._id === activeChatId ? { ...chat, title: trimmed } : chat
        )
      }));
      showToast('Назву діалогу змінено', 'success');
      haptic.tap();
      log.info('chat', 'Chat renamed by user', { chatId: activeChatId, title: trimmed });
    },
    [activeChatId, showToast]
  );

  const handleDeleteChat = (chatId: string) => {
    const chat = data.chats.find((item) => item._id === chatId);
    if (!chat) {
      log.warn('chat', 'Tried to delete a missing chat', { chatId });
      return;
    }

    const confirmed = window.confirm(
      `Видалити діалог «${chat.title}»? Повідомлення буде видалено з вашого акаунта.`
    );
    if (!confirmed) {
      log.debug('chat', 'Chat deletion cancelled', { chatId });
      return;
    }

    if (streamingChatId === chatId) {
      abortRef.current?.abort();
      log.info('chat', 'Cancelled streaming for a chat that is being deleted', { chatId });
    }

    const remaining = data.chats.filter(
      (item) => item._id !== chatId && item.language === chat.language
    );
    const replacement = remaining.length === 0 ? createChat(chat.language, user?.id ?? 'local') : null;
    const nextActiveId =
      data.activeChatId[chat.language] === chatId
        ? remaining[0]?._id ?? replacement?._id ?? null
        : data.activeChatId[chat.language];

    setData((previous) => {
      const chats = previous.chats.filter((item) => item._id !== chatId);
      if (replacement) chats.unshift(replacement);
      const nextMessages = { ...previous.messages };
      delete nextMessages[chatId];
      if (replacement) nextMessages[replacement._id] = [];
      return {
        ...previous,
        chats,
        messages: nextMessages,
        activeChatId: { ...previous.activeChatId, [chat.language]: nextActiveId }
      };
    });

    showToast('Діалог видалено', 'info');
    log.info('chat', 'Chat deleted', { chatId, replacement: replacement?._id ?? null });
  };

  const ensureChatId = (): string | null => {
    if (activeChatId) return activeChatId;
    const chat = createChat(currentLanguage, user?.id ?? 'local');
    setData((previous) => ({
      ...previous,
      chats: [chat, ...previous.chats],
      messages: { ...previous.messages, [chat._id]: [] },
      activeChatId: { ...previous.activeChatId, [currentLanguage]: chat._id }
    }));
    log.info('chat', 'Created a chat on demand', { chatId: chat._id });
    return chat._id;
  };

  const handleSendMessage = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || isSending || sendingRef.current) return;
    if (!user) {
      handleGoogleLogin();
      return;
    }

    const quota = normalizeQuota(data.quota);
    if (quota.remaining <= 0) {
      haptic.warning();
      showToast(`Ліміт вичерпано. Оновлення через ${formatResetAt(quota.resetAt)}`, 'warning');
      return;
    }

    const chatId = ensureChatId();
    if (!chatId) {
      showToast('Не вдалося створити діалог', 'warning');
      return;
    }

    clearSelection();
    stop();
    setPlayingPhrase(undefined);
    sendingRef.current = true;
    setIsSending(true);
    setStreamingContent('');
    setStreamingChatId(chatId);

    const userMessage = createUserMessage(chatId, text, user.id);
    const history = [...(data.messages[chatId] ?? []), userMessage]
      .slice(-20)
      .map((message) => ({ role: message.role, content: message.content }));
    const isFirstMessage = (data.messages[chatId]?.length ?? 0) === 0;
    const now = new Date().toISOString();

    setData((previous) => ({
      ...previous,
      chats: previous.chats.map((chat) =>
        chat._id === chatId
          ? {
              ...chat,
              title: isFirstMessage ? text.slice(0, 36).trim() : chat.title,
              updatedAt: now
            }
          : chat
      ),
      messages: {
        ...previous.messages,
        [chatId]: [...(previous.messages[chatId] ?? []), userMessage]
      },
      quota: { ...quota, remaining: Math.max(0, quota.remaining - 1) },
      activeChatId: { ...previous.activeChatId, [currentLanguage]: chatId }
    }));

    if (isFirstMessage) {
      generateChatTitle(text, currentLanguage)
        .then((aiTitle) => {
          if (!aiTitle) return;
          setData((previous) => ({
            ...previous,
            chats: previous.chats.map((chat) =>
              chat._id === chatId ? { ...chat, title: aiTitle } : chat
            )
          }));
          log.info('chat', 'AI generated chat title applied', { chatId, title: aiTitle });
        })
        .catch((err) => {
          log.warn('chat', 'Failed to generate title', { error: String(err) });
        });
    }

    log.info('chat', 'User message sent', {
      chatId,
      chars: text.length,
      turns: history.length,
      remaining: Math.max(0, quota.remaining - 1)
    });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await streamChat({
        messages: history,
        language: currentLanguage,
        memories: data.memories,
        signal: controller.signal,
        onToken: setStreamingContent,
        onMemory: (fact, scope) => {
          setData((previous) => {
            if (previous.memories[scope].includes(fact)) return previous;
            return {
              ...previous,
              memories: {
                ...previous.memories,
                [scope]: [...previous.memories[scope], fact]
              }
            };
          });
          log.info('memory', 'AI saved a new memory fact', { scope, chars: fact.length });
        }
      });

      const assistantMessage = createAssistantMessage(chatId, result.text);
      setData((previous) => ({
        ...previous,
        messages: {
          ...previous.messages,
          [chatId]: [...(previous.messages[chatId] ?? []), assistantMessage]
        },
        chats: previous.chats.map((chat) =>
          chat._id === chatId ? { ...chat, updatedAt: new Date().toISOString() } : chat
        )
      }));

      log.info('chat', 'Assistant message saved', {
        chatId,
        chars: result.text.length,
        model: result.model
      });
    } catch (error) {
      if (isUserAbort(error)) {
        log.warn('chat', 'Message request cancelled', { chatId });
      } else {
        haptic.warning();
        log.error('chat', 'Message request failed', { chatId, error: errorText(error) });
        showToast(`Не вдалося отримати відповідь: ${errorText(error)}`, 'warning');
      }

      setData((previous) => ({
        ...previous,
        quota: {
          ...previous.quota,
          remaining: Math.min(previous.quota.limit, previous.quota.remaining + 1)
        }
      }));
    } finally {
      setStreamingContent('');
      setStreamingChatId(null);
      setIsSending(false);
      sendingRef.current = false;
      abortRef.current = null;
    }
  };

  const handleMemoryUpdate = (
    scope: keyof UserMemories,
    action: 'add' | 'delete',
    value: string | number
  ) => {
    if (action === 'add') {
      if (typeof value !== 'string') return;
      const fact = value.trim().slice(0, 200);
      if (!fact) return;
      if (data.memories[scope].includes(fact)) {
        showToast('Цей факт уже збережено', 'info');
        return;
      }
      setData((previous) => ({
        ...previous,
        memories: { ...previous.memories, [scope]: [...previous.memories[scope], fact] }
      }));
      showToast('Факт збережено', 'success');
      log.info('memory', 'Memory fact added', { scope, chars: fact.length });
      return;
    }

    if (typeof value !== 'number' || !data.memories[scope][value]) return;
    setData((previous) => ({
      ...previous,
      memories: {
        ...previous.memories,
        [scope]: previous.memories[scope].filter((_, index) => index !== value)
      }
    }));
    showToast('Факт видалено', 'info');
    log.info('memory', 'Memory fact deleted', { scope, index: value });
  };

  const visibleMessages: Message[] = user ? messages : [];
  const visibleChats: Chat[] = user
    ? currentChats.filter((chat) => (data.messages[chat._id]?.length ?? 0) > 0)
    : [];
  const visibleMemories: UserMemories = user
    ? data.memories
    : { global: [], da: [], en: [] };
  const visibleQuota: Quota = data.quota;

  if (!authChecked) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#faf9f6] text-stone-500 dark:bg-[#0c0a09] dark:text-stone-500">
        <p className="font-mono text-[12px]">FastLearn</p>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="flex h-[100dvh] items-center justify-center bg-[#f7f4ee] px-6 text-stone-900 dark:bg-[#12100e] dark:text-stone-100">
        <section className="w-full max-w-sm" aria-labelledby="login-title">
          <p className="font-mono text-[12px] text-amber-700 dark:text-amber-400">FastLearn</p>
          <h1 id="login-title" className="mt-3 text-[32px] font-medium leading-tight">
            Увійдіть, щоб продовжити практику
          </h1>
          <p className="mt-3 text-[14px] leading-6 text-stone-600 dark:text-stone-400">
            Діалоги, налаштування та пам’ять зберігатимуться в вашому акаунті
          </p>
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-stone-300 bg-white px-5 text-[14px] font-medium text-stone-900 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500/30 dark:border-white/[0.12] dark:bg-[#191817] dark:text-stone-100 dark:hover:bg-[#201e1c]"
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Продовжити через Google
          </button>
          <p className="mt-3 text-center text-[11px] text-stone-500 dark:text-stone-500">
            Можна вибрати будь-який Google-акаунт
          </p>
        </section>
      </main>
    );
  }

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#faf9f6] text-stone-900 transition-colors duration-200 dark:bg-[#0c0a09] dark:text-stone-100">
      <Toast toasts={toasts} onDismiss={dismissToast} />

      <Header
        chatTitle={activeChat?.title ?? ''}
        language={currentLanguage}
        onOpenDrawer={handleOpenDrawer}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onSelectLanguage={handleSelectLanguage}
        onRenameChat={handleRenameChat}
      />

      <BurgerDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        user={user}
        isLoggedIn={Boolean(user)}
        onLogin={handleGoogleLogin}
        onLogout={handleLogout}
        currentLanguage={currentLanguage}
        chats={visibleChats}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onCreateNewChat={handleCreateNewChat}
        onDeleteChat={handleDeleteChat}
        onOpenSettings={handleOpenSettings}
        quota={visibleQuota}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        user={user}
        isLoggedIn={Boolean(user)}
        onLogin={handleGoogleLogin}
        currentLanguage={currentLanguage}
        onUpdateLanguage={handleSelectLanguage}
        onLogout={handleLogout}
        memories={visibleMemories}
        onMemoryUpdate={handleMemoryUpdate}
      />

      <ChatStream
        containerRef={chatStreamRef}
        messages={visibleMessages}
        language={currentLanguage}
        onPlayFull={handlePlayAudio}
        onStopAudio={handleStopAudio}
        streamingContent={activeChatId === streamingChatId ? streamingContent : ''}
        onQuickSend={handleSendMessage}
        isPlaying={isPlaying}
        playingText={playingPhrase}
        chatId={activeChatId ?? undefined}
        onShowToast={showToast}
      />

      {selection && (
        <SelectionPopover
          selection={selection}
          language={currentLanguage}
          userId={user?.id ?? ''}
          onClose={clearSelection}
          onPlayAudio={(speed) => handlePlayAudio(selection.text, speed, true)}
          onStopAudio={handleStopAudio}
          isPlaying={isPlaying}
          playingText={playingPhrase}
          currentSpeed={currentSpeed}
        />
      )}

      <ChatInput
        onSend={handleSendMessage}
        disabled={isSending}
        language={currentLanguage}
        remainingMessages={visibleQuota.remaining}
        dailyLimit={visibleQuota.limit}
        resetAt={visibleQuota.resetAt}
        isLoggedIn={Boolean(user)}
        onLogin={handleGoogleLogin}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <SelectionProvider>
      <AppContent />
    </SelectionProvider>
  );
};

function installTheme(theme: 'dark' | 'light') {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme !== 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0c0a09' : '#faf9f6');
}

export default App;
