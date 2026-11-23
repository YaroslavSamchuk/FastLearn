import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, Chat, Message, Language } from './types.ts';
import { Header } from './components/Header.tsx';
import { BurgerDrawer } from './components/BurgerDrawer.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { ChatStream } from './components/ChatStream.tsx';
import { ChatInput } from './components/ChatInput.tsx';
import { SelectionPopover } from './components/SelectionPopover.tsx';
import { useSelection } from './hooks/useSelection.ts';
import { useAudio } from './hooks/useAudio.ts';

export const App: React.FC = () => {
  // State
  const [user, setUser] = useState<User>({
    id: 'usr_yaroslav_01',
    name: 'Yaroslav Samchuk',
    email: 'samchukyaroslav@gmail.com',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
    currentLanguage: 'da',
    voicePreferences: {
      da: 'da-DK-ChristelNeural',
      en: 'en-US-JennyNeural'
    },
    messagesRemaining: 30,
    dailyLimit: 30,
    resetAt: new Date(Date.now() + 15 * 3600 * 1000).toISOString()
  });

  const [currentLanguage, setCurrentLanguage] = useState<Language>('da');
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isSending, setIsSending] = useState(false);

  // Modals & Panels
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // References
  const chatStreamRef = useRef<HTMLDivElement | null>(null);

  // Audio Hook
  const activeVoice = user.voicePreferences[currentLanguage];
  const { play, stop, isPlaying, currentSpeed } = useAudio(currentLanguage, activeVoice);

  // Selection Handler (Auto-pronounce at 0.80x speed on selection)
  const handleTextSelected = useCallback((text: string) => {
    play(text, 0.80);
  }, [play]);

  const { selection, clearSelection } = useSelection({
    containerRef: chatStreamRef,
    onSelect: handleTextSelected,
    maxWords: 30
  });

  // 1. Initial Load: User, Preferences & Daily Quota
  useEffect(() => {
    fetch('/api/user')
      .then(r => r.json())
      .then(u => {
        if (u) {
          setUser(u);
          if (u.currentLanguage) {
            setCurrentLanguage(u.currentLanguage);
          }
        }
      })
      .catch(console.warn);
  }, []);

  // 2. Fetch Chats whenever currentLanguage changes
  const fetchChats = useCallback(async (lang: Language) => {
    try {
      const res = await fetch(`/api/chats?language=${lang}`);
      const data: Chat[] = await res.json();
      setChats(data);

      if (data.length > 0) {
        setActiveChatId(data[0]._id);
      } else {
        const createRes = await fetch('/api/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: lang,
            title: lang === 'da' ? 'Ny samtale' : 'New chat'
          })
        });
        const newChat: Chat = await createRes.json();
        setChats([newChat]);
        setActiveChatId(newChat._id);
      }
    } catch (e) {
      console.warn('Error fetching chats:', e);
    }
  }, []);

  useEffect(() => {
    fetchChats(currentLanguage);
  }, [currentLanguage, fetchChats]);

  // 3. Fetch Messages for active chat
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }

    fetch(`/api/chats/${activeChatId}/messages`)
      .then(r => r.json())
      .then(data => {
        setMessages(Array.isArray(data) ? data : []);
      })
      .catch(console.warn);
  }, [activeChatId]);

  // 4. Send Message & Consume Stream
  const handleSendMessage = async (text: string) => {
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

    setMessages(prev => [...prev, tempUserMsg]);
    setStreamingContent('');

    try {
      const res = await fetch(`/api/chats/${activeChatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, language: currentLanguage })
      });

      if (res.status === 429) {
        const errData = await res.json();
        alert(errData.error || 'Денний ліміт вичерпано.');
        if (errData.messagesRemaining !== undefined) {
          setUser(prev => ({ ...prev, messagesRemaining: 0 }));
        }
        setIsSending(false);
        return;
      }

      if (!res.ok) throw new Error('Failed to send message');

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
                  // Live quota update from server
                  setUser(prev => ({
                    ...prev,
                    messagesRemaining: parsed.quota.messagesRemaining,
                    resetAt: parsed.quota.resetAt
                  }));
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
        setMessages(prev => [...prev, finalAiMsg]);
      }
      setStreamingContent('');
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setIsSending(false);
    }
  };

  // 5. Create New Chat
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
      setChats(prev => [newChat, ...prev]);
      setActiveChatId(newChat._id);
      setMessages([]);
    } catch (e) {
      console.warn('Create chat error:', e);
    }
  };

  // 6. Delete Chat
  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/chats/${chatId}`, { method: 'DELETE' });
      setChats(prev => prev.filter(c => c._id !== chatId));
      if (activeChatId === chatId) {
        const remaining = chats.filter(c => c._id !== chatId);
        if (remaining.length > 0) {
          setActiveChatId(remaining[0]._id);
        } else {
          handleCreateNewChat();
        }
      }
    } catch (err) {
      console.warn('Delete chat error:', err);
    }
  };

  // 7. Language Switch
  const handleSelectLanguage = async (newLang: Language) => {
    if (newLang === currentLanguage) return;
    clearSelection();
    stop();
    setCurrentLanguage(newLang);
    setUser(prev => ({ ...prev, currentLanguage: newLang }));

    fetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentLanguage: newLang })
    }).catch(console.warn);
  };

  // 8. Voice Switch
  const handleUpdateVoice = async (voiceId: string) => {
    const updatedPreferences = {
      ...user.voicePreferences,
      [currentLanguage]: voiceId
    };
    setUser(prev => ({
      ...prev,
      voicePreferences: updatedPreferences
    }));

    fetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voicePreferences: updatedPreferences })
    }).catch(console.warn);
  };

  // 9. Logout
  const handleLogout = () => {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
    alert('Сесію скинуто. Ви можете обрати інший Google акаунт.');
  };

  const activeChat = chats.find(c => c._id === activeChatId);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#09090b] text-[#f4f4f5]">
      {/* 1. Header Bar */}
      <Header
        chatTitle={activeChat?.title || ''}
        language={currentLanguage}
        onOpenDrawer={() => setIsDrawerOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 2. Burger Navigation Drawer */}
      <BurgerDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        user={user}
        currentLanguage={currentLanguage}
        onSelectLanguage={handleSelectLanguage}
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={setActiveChatId}
        onCreateNewChat={handleCreateNewChat}
        onDeleteChat={handleDeleteChat}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 3. Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        user={user}
        currentLanguage={currentLanguage}
        onUpdateLanguage={handleSelectLanguage}
        currentVoice={activeVoice}
        onUpdateVoice={handleUpdateVoice}
        onLogout={handleLogout}
      />

      {/* 4. Chat Messages Stream */}
      <ChatStream
        containerRef={chatStreamRef}
        messages={messages}
        language={currentLanguage}
        onPlayFull={(t) => play(t, 0.85)}
        streamingContent={streamingContent}
      />

      {/* 5. Custom Selection Popover Modal */}
      {selection && (
        <SelectionPopover
          selection={selection}
          language={currentLanguage}
          onClose={clearSelection}
          onPlayAudio={(speed) => play(selection.text, speed)}
          isPlaying={isPlaying}
          currentSpeed={currentSpeed}
        />
      )}

      {/* 6. Chat Input Composer with Quota Enforcement */}
      <ChatInput
        onSend={handleSendMessage}
        disabled={isSending}
        language={currentLanguage}
        remainingMessages={user.messagesRemaining}
      />
    </div>
  );
};

export default App;
