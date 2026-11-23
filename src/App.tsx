// language: TypeScript (React), file: src/App.tsx, target: Web / Mobile Browser
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, Chat, Message, Language } from './types.ts';
import { Header } from './components/Header.tsx';
import { BurgerDrawer } from './components/BurgerDrawer.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { ChatStream } from './components/ChatStream.tsx';
import { ChatInput } from './components/ChatInput.tsx';
import { SelectionPopover } from './components/SelectionPopover.tsx';
import { WordVaultDrawer } from './components/WordVaultDrawer.tsx';
import { LivingAura } from './components/LivingAura.tsx';
import { Toast } from './components/Toast.tsx';
import { useSelection } from './hooks/useSelection.ts';
import { useAudio } from './hooks/useAudio.ts';
import { useToast } from './hooks/useToast.ts';
import { haptic } from './utils/haptics.ts';

const STORAGE_KEY = 'fastlearn_user';
const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '1070469323860-5tkdtehar2jl2ktjlfh6h9bd4k3ou6gp.apps.googleusercontent.com';

export const App: React.FC = () => {
  // Theme State (Dark / Light)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('fastlearn_theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    localStorage.setItem('fastlearn_theme', theme);
  }, [theme]);

  const handleToggleTheme = () => {
    haptic.tap();
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Toast System
  const { toasts, showToast, dismissToast } = useToast();

  // Authentication State
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [currentLanguage, setCurrentLanguage] = useState<Language>('da');
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isSending, setIsSending] = useState(false);

  // Modals & Drawers
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWordVaultOpen, setIsWordVaultOpen] = useState(false);
  const [playingPhrase, setPlayingPhrase] = useState<string | undefined>();

  // References
  const chatStreamRef = useRef<HTMLDivElement | null>(null);

  // Audio Hook
  const activeVoice =
    user?.voicePreferences?.[currentLanguage] ||
    (currentLanguage === 'da' ? 'da-DK-ChristelNeural' : 'en-US-JennyNeural');
  const { play, stop, isPlaying, currentSpeed } = useAudio(currentLanguage, activeVoice);

  const handlePlayAudio = useCallback(
    (text: string, speed = 0.85) => {
      setPlayingPhrase(text);
      play(text, speed);
    },
    [play]
  );

  // Selection Handler (Auto-pronounce at 0.80x speed on selection)
  const handleTextSelected = useCallback(
    (text: string) => {
      handlePlayAudio(text, 0.8);
    },
    [handlePlayAudio]
  );

  const { selection, clearSelection } = useSelection({
    containerRef: chatStreamRef,
    onSelect: handleTextSelected,
    maxWords: 30
  });

  // 1. Process Google OAuth Redirect (token / id_token returned in URL hash)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && (hash.includes('access_token=') || hash.includes('id_token='))) {
      const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
      const idToken = hashParams.get('id_token');
      const accessToken = hashParams.get('access_token');

      window.history.replaceState(null, '', window.location.pathname);

      const authenticateWithGoogle = async () => {
        try {
          let profile: { sub: string; name: string; email: string; picture: string } | null = null;

          if (idToken) {
            const base64Url = idToken.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(
              atob(base64)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
            );
            profile = JSON.parse(jsonPayload);
          } else if (accessToken) {
            const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            profile = await res.json();
          }

          if (profile && profile.email) {
            const clientUser: User = {
              id: profile.sub ? `google_${profile.sub}` : `usr_${Date.now()}`,
              name: profile.name || 'Користувач',
              email: profile.email,
              avatar:
                profile.picture ||
                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
              currentLanguage: 'da',
              voicePreferences: {
                da: 'da-DK-ChristelNeural',
                en: 'en-US-JennyNeural'
              },
              messagesRemaining: 30,
              dailyLimit: 30,
              resetAt: new Date(Date.now() + 15 * 3600 * 1000).toISOString(),
              memories: {
                global: [
                  `Звати ${profile.name || 'користувач'}. Рідна мова — українська.`,
                  'Цінує стислість, природність, живий дружній тон без зайвих слів.'
                ],
                da: ['Вивчає розмовну данську мову (Dansk) для повсякденного життя та спілкування.'],
                en: ['Вільне повсякденне та ділове спілкування англійською.']
              }
            };

            setUser(clientUser);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(clientUser));
            haptic.success();
            showToast(`Вітаємо, ${clientUser.name}!`, 'success');

            try {
              const res = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: profile.sub,
                  name: profile.name,
                  email: profile.email,
                  avatar: profile.picture
                })
              });
              const contentType = res.headers.get('content-type') || '';
              if (res.ok && contentType.includes('application/json')) {
                const serverUserData: User = await res.json();
                if (serverUserData && serverUserData.id) {
                  setUser(serverUserData);
                  localStorage.setItem(STORAGE_KEY, JSON.stringify(serverUserData));
                  if (serverUserData.currentLanguage) {
                    setCurrentLanguage(serverUserData.currentLanguage);
                  }
                }
              }
            } catch (syncErr) {
              console.warn('Backend sync skipped or offline:', syncErr);
            }
          }
        } catch (err) {
          console.error('Failed to authenticate Google user:', err);
        }
      };

      authenticateWithGoogle();
    }
  }, [showToast]);

  // 2. Sync user profile from server
  useEffect(() => {
    if (!user) return;
    const emailParam = user.email ? `?email=${encodeURIComponent(user.email)}` : '';
    fetch(`/api/user${emailParam}`)
      .then((r) => {
        const ct = r.headers.get('content-type') || '';
        if (r.ok && ct.includes('application/json')) return r.json();
        return null;
      })
      .then((u) => {
        if (u && u.id) {
          setUser(u);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
          if (u.currentLanguage) {
            setCurrentLanguage(u.currentLanguage);
          }
        }
      })
      .catch(console.warn);
  }, []);

  const handleGoogleLogin = () => {
    haptic.impact();
    const redirectUri = window.location.origin + window.location.pathname;
    const nonce = Math.random().toString(36).substring(2);
    const state = Math.random().toString(36).substring(2);

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'token id_token',
      scope: 'openid email profile',
      prompt: 'select_account',
      nonce: nonce,
      state: state
    });

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  };

  const handleLogout = () => {
    haptic.tap();
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
    setIsSettingsOpen(false);
    showToast('Ви вийшли з акаунта', 'info');
  };

  // Fetch Chats for current language
  const fetchChats = useCallback(
    async (lang: Language) => {
      try {
        const res = await fetch(`/api/chats?language=${lang}`);
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.includes('application/json')) {
          const data: Chat[] = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setChats(data);
            setActiveChatId(data[0]._id);
            return;
          }
        }

        const fallbackChatId = `chat_${lang}_default`;
        const fallbackChat: Chat = {
          _id: fallbackChatId,
          userId: user?.id || 'client',
          language: lang,
          title: lang === 'da' ? 'Ny samtale' : 'New dialogue',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        setChats([fallbackChat]);
        setActiveChatId(fallbackChatId);
      } catch (e) {
        console.warn('Fallback to local chat:', e);
        const fallbackChatId = `chat_${lang}_default`;
        const fallbackChat: Chat = {
          _id: fallbackChatId,
          userId: user?.id || 'client',
          language: lang,
          title: lang === 'da' ? 'Ny samtale' : 'New dialogue',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        setChats([fallbackChat]);
        setActiveChatId(fallbackChatId);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    fetchChats(currentLanguage);
  }, [currentLanguage, fetchChats]);

  // Fetch Messages for active chat
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }

    fetch(`/api/chats/${activeChatId}/messages`)
      .then((r) => {
        const ct = r.headers.get('content-type') || '';
        if (r.ok && ct.includes('application/json')) return r.json();
        return [];
      })
      .then((data) => {
        setMessages(Array.isArray(data) ? data : []);
      })
      .catch(() => setMessages([]));
  }, [activeChatId]);

  // Client-side fallback response when connection fails
  const directClientChatFallback = async (text: string, lang: Language) => {
    return lang === 'da'
      ? 'Hej! Dejligt at snakke med dig. Hvad vil du gerne øve i dag?'
      : 'Hey there! Nice to chat with you. What would you like to practice today?';
  };

  // Send Message & Consume Stream
  const handleSendMessage = async (text: string) => {
    if (!user) {
      handleGoogleLogin();
      return;
    }
    if (!activeChatId || isSending) return;

    clearSelection();
    stop();
    setIsSending(true);

    const tempUserMsg: Message = {
      chatId: activeChatId,
      userId: user.id,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString()
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setStreamingContent('');

    try {
      const res = await fetch(`/api/chats/${activeChatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, language: currentLanguage })
      });

      if (res.status === 429) {
        const ct = res.headers.get('content-type') || '';
        const errData = ct.includes('application/json') ? await res.json() : {};
        haptic.warning();
        showToast(errData.error || 'Денний ліміт вичерпано', 'warning');
        if (errData.messagesRemaining !== undefined) {
          setUser((prev) => (prev ? { ...prev, messagesRemaining: 0 } : null));
        }
        setIsSending(false);
        return;
      }

      // If backend responded with 404/405 or failed, use resilient client fallback
      if (!res.ok) {
        const fallbackAiReply = await directClientChatFallback(text, currentLanguage);
        // Simulate smooth word-by-word streaming
        const words = fallbackAiReply.split(' ');
        let accumulated = '';
        for (let i = 0; i < words.length; i++) {
          accumulated += words[i] + (i < words.length - 1 ? ' ' : '');
          setStreamingContent(accumulated);
          await new Promise((r) => setTimeout(r, 25));
        }

        const finalAiMsg: Message = {
          chatId: activeChatId,
          userId: 'ai',
          role: 'assistant',
          content: fallbackAiReply.trim(),
          createdAt: new Date().toISOString()
        };
        setMessages((prev) => [...prev, finalAiMsg]);
        setStreamingContent('');
        setIsSending(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedAiText = '';

      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6);
              if (dataStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.quota) {
                  setUser((prev) =>
                    prev
                      ? {
                          ...prev,
                          messagesRemaining: parsed.quota.messagesRemaining,
                          resetAt: parsed.quota.resetAt
                        }
                      : null
                  );
                }
                if (parsed.memoryLearned) {
                  const { scope, fact } = parsed.memoryLearned;
                  showToast(`ШІ запам’ятав факт: "${fact.slice(0, 32)}..."`, 'info');
                  setUser((prev) => {
                    if (!prev) return null;
                    const mem = prev.memories || { global: [], da: [], en: [] };
                    const currentList = mem[scope as 'global' | 'da' | 'en'] || [];
                    if (!currentList.includes(fact)) {
                      return {
                        ...prev,
                        memories: {
                          ...mem,
                          [scope]: [...currentList, fact]
                        }
                      };
                    }
                    return prev;
                  });
                }
                if (parsed.token) {
                  accumulatedAiText += parsed.token;
                  setStreamingContent(accumulatedAiText);
                }
              } catch (e) {}
            }
          }
        }
      }

      // Finalize AI message
      if (accumulatedAiText.trim()) {
        const finalAiMsg: Message = {
          chatId: activeChatId,
          userId: 'ai',
          role: 'assistant',
          content: accumulatedAiText.trim(),
          createdAt: new Date().toISOString()
        };
        setMessages((prev) => [...prev, finalAiMsg]);
      }
      setStreamingContent('');
    } catch (err) {
      console.warn('Backend stream error, using client direct failover:', err);
      try {
        const fallbackReply = await directClientChatFallback(text, currentLanguage);
        const finalAiMsg: Message = {
          chatId: activeChatId,
          userId: 'ai',
          role: 'assistant',
          content: fallbackReply.trim(),
          createdAt: new Date().toISOString()
        };
        setMessages((prev) => [...prev, finalAiMsg]);
      } catch {
        showToast('Помилка зв’язку з моделлю', 'warning');
      }
    } finally {
      setIsSending(false);
    }
  };

  // Create New Chat
  const handleCreateNewChat = async () => {
    clearSelection();
    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: currentLanguage,
          title: currentLanguage === 'da' ? 'Ny samtale' : 'New chat'
        })
      });
      const newChat: Chat = await res.json();
      setChats((prev) => [newChat, ...prev]);
      setActiveChatId(newChat._id);
      setMessages([]);
      showToast('Створено новий діалог', 'success');
    } catch (e) {
      console.warn('Create chat error:', e);
    }
  };

  // Delete Chat
  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/chats/${chatId}`, { method: 'DELETE' });
      setChats((prev) => prev.filter((c) => c._id !== chatId));
      if (activeChatId === chatId) {
        const remaining = chats.filter((c) => c._id !== chatId);
        if (remaining.length > 0) {
          setActiveChatId(remaining[0]._id);
        } else {
          handleCreateNewChat();
        }
      }
      showToast('Діалог видалено', 'info');
    } catch (err) {
      console.warn('Delete chat error:', err);
    }
  };

  // Language Switch
  const handleSelectLanguage = async (newLang: Language) => {
    if (newLang === currentLanguage) return;
    clearSelection();
    stop();
    setCurrentLanguage(newLang);
    setUser((prev) => (prev ? { ...prev, currentLanguage: newLang } : null));
    showToast(`Перемкнуто на: ${newLang === 'da' ? 'Dansk 🇩🇰' : 'English 🇬🇧'}`, 'info');

    fetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentLanguage: newLang })
    }).catch(console.warn);
  };

  // Voice Switch
  const handleUpdateVoice = async (voiceId: string) => {
    if (!user) return;
    const updatedPreferences = {
      ...user.voicePreferences,
      [currentLanguage]: voiceId
    };
    setUser((prev) =>
      prev
        ? {
            ...prev,
            voicePreferences: updatedPreferences
          }
        : null
    );
    showToast('Голос оновлено', 'success');

    fetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voicePreferences: updatedPreferences })
    }).catch(console.warn);
  };

  // Memory Updates
  const handleMemoryUpdate = (
    scope: 'global' | 'da' | 'en',
    action: 'add' | 'delete',
    value: string | number
  ) => {
    setUser((prev) => {
      if (!prev) return null;
      const mem = prev.memories || { global: [], da: [], en: [] };
      const list = [...(mem[scope] || [])];
      if (action === 'add' && typeof value === 'string') {
        list.push(value);
        showToast('Факт збережено у пам’ять', 'success');
      } else if (action === 'delete' && typeof value === 'number') {
        list.splice(value, 1);
        showToast('Факт видалено з пам’яті', 'info');
      }
      return {
        ...prev,
        memories: {
          ...mem,
          [scope]: list
        }
      };
    });
  };

  const activeChat = chats.find((c) => c._id === activeChatId);

  return (
    <div className="relative flex flex-col h-screen w-screen overflow-hidden bg-[#fafafa] dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 font-sans transition-colors duration-200">
      {/* 0. Living Gemini Aura Background */}
      <LivingAura isStreaming={!!streamingContent} isPlaying={isPlaying} />

      {/* 0.1 Dynamic Island / Toast System */}
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* 1. Translucent Floating Dynamic Header */}
      <Header
        chatTitle={activeChat?.title || ''}
        language={currentLanguage}
        onOpenDrawer={() => setIsDrawerOpen(true)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenWordVault={() => setIsWordVaultOpen(true)}
        onSelectLanguage={handleSelectLanguage}
      />

      {/* 2. Frosted Burger Navigation Drawer */}
      <BurgerDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        user={user}
        isLoggedIn={!!user}
        onLogin={handleGoogleLogin}
        onLogout={handleLogout}
        currentLanguage={currentLanguage}
        onSelectLanguage={handleSelectLanguage}
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={setActiveChatId}
        onCreateNewChat={handleCreateNewChat}
        onDeleteChat={handleDeleteChat}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenWordVault={() => setIsWordVaultOpen(true)}
      />

      {/* 3. Word Vault Vocabulary Drawer */}
      <WordVaultDrawer
        isOpen={isWordVaultOpen}
        onClose={() => setIsWordVaultOpen(false)}
        language={currentLanguage}
        onPlayAudio={(text, speed) => handlePlayAudio(text, speed)}
        isPlaying={isPlaying}
        currentPlayingText={playingPhrase}
        onShowToast={showToast}
      />

      {/* 4. Full-screen Settings & Memory Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        user={user}
        isLoggedIn={!!user}
        onLogin={handleGoogleLogin}
        currentLanguage={currentLanguage}
        onUpdateLanguage={handleSelectLanguage}
        currentVoice={activeVoice}
        onUpdateVoice={handleUpdateVoice}
        onLogout={handleLogout}
        onMemoryUpdate={handleMemoryUpdate}
      />

      {/* 5. Chat Messages Stream */}
      <ChatStream
        containerRef={chatStreamRef}
        messages={messages}
        language={currentLanguage}
        onPlayFull={(t, sp) => handlePlayAudio(t, sp ?? 0.85)}
        streamingContent={streamingContent}
        onQuickSend={handleSendMessage}
        isPlaying={isPlaying}
        onShowToast={showToast}
      />

      {/* 6. Custom Selection Popover Modal */}
      {selection && (
        <SelectionPopover
          selection={selection}
          language={currentLanguage}
          onClose={clearSelection}
          onPlayAudio={(speed) => play(selection.text, speed)}
          isPlaying={isPlaying}
          currentSpeed={currentSpeed}
          onShowToast={showToast}
        />
      )}

      {/* 7. Gemini Pill Chat Input / Login Gate */}
      <ChatInput
        onSend={handleSendMessage}
        disabled={isSending}
        language={currentLanguage}
        remainingMessages={user?.messagesRemaining ?? 30}
        isLoggedIn={!!user}
        onLogin={handleGoogleLogin}
      />
    </div>
  );
};

export default App;
