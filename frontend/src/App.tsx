import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  BookOpen,
  Settings,
  Plus,
  Sparkles,
  Trash2
} from 'lucide-react';
import type { AppSettings, ChatMessage, ChatSession, WordMap, WordRecord, WordStatus } from './types';
import { StorageService } from './services/storage';
import { GeminiService } from './services/gemini';
import { SpeechService } from './services/speech';
import { cleanDanishWord } from './services/dictionary';
import { MessageItem } from './components/Chat/MessageItem';
import { ChatInput } from './components/Chat/ChatInput';
import { WordPopover } from './components/LingQ/WordPopover';
import { SelectionBar } from './components/LingQ/SelectionBar';
import { ChatsSidebar } from './components/Sidebar/ChatsSidebar';
import { VocabularySidebar } from './components/Sidebar/VocabularySidebar';
import { SettingsModal } from './components/Modal/SettingsModal';
import { ApiKeyBanner } from './components/Modal/ApiKeyBanner';

export const App: React.FC = () => {
  // App settings
  const [settings, setSettings] = useState<AppSettings>(() => StorageService.getSettings());

  // Chats & active chat
  const [chats, setChats] = useState<ChatSession[]>(() => StorageService.getChats());
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    const saved = StorageService.getActiveChatId();
    if (saved) return saved;
    const existing = StorageService.getChats();
    return existing[0]?.id || null;
  });

  // Current messages
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const active = StorageService.getActiveChatId();
    if (active) return StorageService.getMessages(active);
    return [];
  });

  // Vocabulary & LingQ map
  const [wordsMap, setWordsMap] = useState<WordMap>(() => StorageService.getWordsMap());
  const [wordsList, setWordsList] = useState<WordRecord[]>(() => StorageService.getWordRecords());

  // UI State
  const [loading, setLoading] = useState(false);
  const [isChatsOpen, setIsChatsOpen] = useState(false);
  const [isVocabOpen, setIsVocabOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Active word popover
  const [activeWordPopover, setActiveWordPopover] = useState<{
    word: string;
    contextSentence: string;
    targetRect: DOMRect | null;
  } | null>(null);

  // Active phrase selection bar
  const [activeSelectionBar, setActiveSelectionBar] = useState<{
    phrase: string;
    targetRect: DOMRect | null;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize first chat if none exists
  useEffect(() => {
    if (chats.length === 0) {
      const initialChat = StorageService.createChat('Знайомство з датською');
      const initialGreeting: ChatMessage = {
        id: 'msg_welcome',
        role: 'model',
        content: 'Hej! Velkommen til FastLearn. Jeg er din personlige dansklærer. Hvordan går det i dag?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        model_used: settings.model,
      };
      StorageService.saveMessages(initialChat.id, [initialGreeting]);
      setChats([initialChat]);
      setActiveChatId(initialChat.id);
      setMessages([initialGreeting]);
    }
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Handle switching active chat
  const handleSelectChat = (id: string) => {
    setActiveChatId(id);
    StorageService.setActiveChatId(id);
    const msgs = StorageService.getMessages(id);
    setMessages(msgs);
  };

  // Handle creating a new chat
  const handleCreateChat = () => {
    const newChat = StorageService.createChat();
    const updatedChats = StorageService.getChats();
    setChats(updatedChats);
    setActiveChatId(newChat.id);

    const greeting: ChatMessage = {
      id: 'msg_' + Math.random().toString(36).substring(2, 9),
      role: 'model',
      content: 'Hej! Hvad vil du tale om i dag? Vi kan tale om vejret, mad, arbejde eller din hverdag.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      model_used: settings.model,
    };
    StorageService.saveMessages(newChat.id, [greeting]);
    setMessages([greeting]);
  };

  // Handle deleting a chat
  const handleDeleteChat = (id: string) => {
    StorageService.deleteChat(id);
    const updatedChats = StorageService.getChats();
    setChats(updatedChats);

    if (activeChatId === id) {
      if (updatedChats.length > 0) {
        handleSelectChat(updatedChats[0].id);
      } else {
        handleCreateChat();
      }
    }
  };

  // Clear current chat
  const handleClearChat = () => {
    if (!activeChatId) return;
    if (confirm('Очистити історію цієї бесіди?')) {
      StorageService.saveMessages(activeChatId, []);
      setMessages([]);
    }
  };

  // Sending message to Gemini
  const handleSendMessage = async (userText: string) => {
    if (!userText.trim() || loading || !activeChatId) return;

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: 'msg_' + Date.now() + '_user',
      role: 'user',
      content: userText,
      timestamp: now,
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    StorageService.saveMessages(activeChatId, updatedMessages);
    setLoading(true);

    try {
      const response = await GeminiService.sendChatMessage({
        apiKey: settings.apiKey,
        model: settings.model,
        userMessage: userText,
        history: updatedMessages,
        level: settings.level,
        userNotes: settings.userNotes,
      });

      const modelMsg: ChatMessage = {
        id: 'msg_' + Date.now() + '_model',
        role: 'model',
        content: response.danish_reply,
        correction: response.correction,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        model_used: settings.model,
      };

      const finalMessages = [...updatedMessages, modelMsg];
      setMessages(finalMessages);
      StorageService.saveMessages(activeChatId, finalMessages);
      setChats(StorageService.getChats());

      if (settings.autoSpeakAi) {
        SpeechService.speak(response.danish_reply, { rate: settings.speechRate });
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: 'msg_' + Date.now() + '_err',
        role: 'model',
        content: `Beklager, der opstod en fejl: ${err?.message || 'Не вдалося отримати відповідь від Gemini.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        model_used: 'error',
      };
      const finalWithErr = [...updatedMessages, errorMsg];
      setMessages(finalWithErr);
      StorageService.saveMessages(activeChatId, finalWithErr);
    } finally {
      setLoading(false);
    }
  };

  // Word Click -> Open Popover
  const handleWordClick = (word: string, contextSentence: string, targetRect: DOMRect) => {
    setActiveSelectionBar(null);
    setActiveWordPopover({
      word,
      contextSentence,
      targetRect,
    });
  };

  // Update Word Status & details
  const handleUpdateWordStatus = (
    word: string,
    status: WordStatus,
    translation?: string,
    synonyms?: string[]
  ) => {
    const clean = cleanDanishWord(word);
    StorageService.saveWord({
      word,
      word_clean: clean,
      status,
      translation_uk: translation || '',
      synonyms: synonyms || [],
    });

    setWordsMap(StorageService.getWordsMap());
    setWordsList(StorageService.getWordRecords());
  };

  // Phrase selection
  const handlePhraseSelect = (phraseText: string, targetRect: DOMRect) => {
    setActiveWordPopover(null);
    setActiveSelectionBar({
      phrase: phraseText,
      targetRect,
    });
  };

  // Save selected phrase to vocabulary
  const handleSavePhrase = (phrase: string, translation: string) => {
    const clean = cleanDanishWord(phrase);
    StorageService.saveWord({
      word: phrase,
      word_clean: clean,
      status: 1, // Learning
      translation_uk: translation,
    });
    setWordsMap(StorageService.getWordsMap());
    setWordsList(StorageService.getWordRecords());
  };

  // Settings update
  const handleSaveSettings = (updated: Partial<AppSettings>) => {
    const finalSettings = StorageService.saveSettings(updated);
    setSettings(finalSettings);
  };

  // Delete word from vocabulary
  const handleDeleteWord = (wordClean: string) => {
    StorageService.deleteWord(wordClean);
    setWordsMap(StorageService.getWordsMap());
    setWordsList(StorageService.getWordRecords());
  };

  const activeChat = chats.find((c) => c.id === activeChatId);

  return (
    <div className="flex flex-col h-screen bg-[#f8f8f6] text-black antialiased selection:bg-black selection:text-white">
      {/* Top Header */}
      <header className="border-b-2 border-black bg-white sticky top-0 z-40 brutal-shadow">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between">
          {/* Logo & Status badge */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-mono font-bold tracking-tighter text-lg">
              <span className="text-xl">🇩🇰</span>
              <span className="bg-black text-white px-1.5 py-0.5">FASTLEARN</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-zinc-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>DANSK AI</span>
            </div>
          </div>

          {/* Center info */}
          <div className="hidden md:flex items-center gap-2 text-xs font-mono">
            <span className="bg-yellow-200 border border-black px-1.5 py-0.5 font-bold">
              [{settings.level}]
            </span>
            <span className="bg-zinc-100 border border-black px-1.5 py-0.5 text-zinc-700">
              {settings.model}
            </span>
            <span className="bg-zinc-100 border border-black px-1.5 py-0.5 text-zinc-700">
              СЛІВ: {wordsList.length}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsChatsOpen(true)}
              className="brutal-btn px-2.5 py-1.5 bg-zinc-100 text-xs font-mono flex items-center gap-1.5 cursor-pointer"
              title="Список діалогів"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Діалоги</span>
              <span className="font-bold">({chats.length})</span>
            </button>

            <button
              onClick={() => setIsVocabOpen(true)}
              className="brutal-btn px-2.5 py-1.5 bg-yellow-200 text-xs font-mono flex items-center gap-1.5 cursor-pointer"
              title="Словник слів LingQ"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Словник</span>
              <span className="font-bold">({wordsList.length})</span>
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className={`brutal-btn p-1.5 text-xs font-mono flex items-center justify-center cursor-pointer relative ${
                !settings.apiKey ? 'bg-amber-300 animate-bounce' : 'bg-zinc-100'
              }`}
              title="Налаштування"
            >
              <Settings className="w-4 h-4 text-black" />
              {!settings.apiKey && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-600 rounded-full border border-black" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Banner if Gemini key is missing */}
      {!settings.apiKey && (
        <ApiKeyBanner onOpenSettings={() => setIsSettingsOpen(true)} />
      )}

      {/* Active Conversation Sub-header */}
      <div className="bg-zinc-100 border-b-2 border-black px-4 py-1.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 truncate">
            <span className="text-zinc-500 font-bold uppercase">[ПОТОЧНИЙ ТРЕК]:</span>
            <span className="font-bold text-zinc-950 truncate">
              {activeChat?.title || 'Діалог'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCreateChat}
              className="px-2 py-0.5 bg-white hover:bg-zinc-200 border border-black flex items-center gap-1 transition-colors text-black"
              title="Створити нову тему"
            >
              <Plus className="w-3 h-3" />
              <span>Нова бесіда</span>
            </button>
            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="px-2 py-0.5 hover:bg-red-500 hover:text-white border border-black transition-colors"
                title="Очистити поточний чат"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Conversation Stream */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto">
          {/* Welcome Screen / Empty State */}
          {messages.length === 0 ? (
            <div className="p-8 border-2 border-black bg-white brutal-shadow-lg text-center my-6">
              <div className="text-4xl mb-3">🇩🇰</div>
              <h2 className="text-xl font-bold font-mono uppercase tracking-tight mb-2">
                Ласкаво просимо до FastLearn
              </h2>
              <p className="text-sm text-zinc-600 max-w-md mx-auto mb-6 leading-relaxed">
                Живий діалог з ШІ датською мовою у стилі <strong>LingQ</strong>. Клікайте на будь-яке слово, щоб дізнатися переклад, синоніми та статус вивчення.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-left text-xs font-mono mb-6">
                <div className="p-2.5 border border-black bg-blue-50">
                  <div className="font-bold text-blue-900 mb-1">1. Нові слова</div>
                  <div className="text-zinc-600">Виділені синім. Клікніть для перекладу та озвучки.</div>
                </div>
                <div className="p-2.5 border border-black bg-yellow-50">
                  <div className="font-bold text-yellow-900 mb-1">2. Словник LingQ</div>
                  <div className="text-zinc-600">Відзначайте слова рівнями [1], [2], [✓ Знаю].</div>
                </div>
                <div className="p-2.5 border border-black bg-emerald-50">
                  <div className="font-bold text-emerald-900 mb-1">3. Корекція помилок</div>
                  <div className="text-zinc-600">ШІ миттєво виправляє помилки та вчить ідіомам.</div>
                </div>
              </div>

              <button
                onClick={() => handleSendMessage('Hej! Hvordan har du det?')}
                className="brutal-btn px-6 py-2.5 bg-black text-white text-xs font-mono font-bold inline-flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-yellow-300" />
                <span>Почати розмову: «Hej! Hvordan har du det?»</span>
              </button>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageItem
                key={msg.id}
                message={msg}
                wordsMap={wordsMap}
                speechRate={settings.speechRate}
                onWordClick={handleWordClick}
                onPhraseSelect={handlePhraseSelect}
                selectedPhrase={activeSelectionBar?.phrase}
              />
            ))
          )}

          {/* Loading indicator */}
          {loading && (
            <div className="flex items-center gap-2 mb-4 text-xs font-mono text-zinc-500">
              <span className="w-2 h-2 bg-black animate-ping" />
              <span>ШІ пише відповідь датською...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Docked Chat Input */}
      <footer className="sticky bottom-0 z-30 max-w-3xl mx-auto w-full px-4 pb-3">
        <ChatInput
          onSendMessage={handleSendMessage}
          loading={loading}
          level={settings.level}
          model={settings.model}
          hasApiKey={Boolean(settings.apiKey)}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      </footer>

      {/* Overlays: Word Popover */}
      {activeWordPopover && (
        <WordPopover
          word={activeWordPopover.word}
          contextSentence={activeWordPopover.contextSentence}
          targetRect={activeWordPopover.targetRect}
          currentStatus={
            wordsMap[cleanDanishWord(activeWordPopover.word)]?.status ?? 0
          }
          savedTranslation={
            wordsMap[cleanDanishWord(activeWordPopover.word)]?.translation_uk
          }
          apiKey={settings.apiKey}
          model={settings.model}
          speechRate={settings.speechRate}
          onUpdateStatus={handleUpdateWordStatus}
          onClose={() => setActiveWordPopover(null)}
        />
      )}

      {/* Overlays: Selection Bar for phrases */}
      {activeSelectionBar && (
        <SelectionBar
          phraseText={activeSelectionBar.phrase}
          targetRect={activeSelectionBar.targetRect}
          apiKey={settings.apiKey}
          model={settings.model}
          speechRate={settings.speechRate}
          onSavePhrase={handleSavePhrase}
          onClose={() => setActiveSelectionBar(null)}
        />
      )}

      {/* Drawers & Modals */}
      <ChatsSidebar
        isOpen={isChatsOpen}
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onCreateChat={handleCreateChat}
        onDeleteChat={handleDeleteChat}
        onClose={() => setIsChatsOpen(false)}
      />

      <VocabularySidebar
        isOpen={isVocabOpen}
        words={wordsList}
        speechRate={settings.speechRate}
        onUpdateStatus={(wordClean, status) => {
          StorageService.updateWordStatus(wordClean, status);
          setWordsMap(StorageService.getWordsMap());
          setWordsList(StorageService.getWordRecords());
        }}
        onDeleteWord={handleDeleteWord}
        onReloadWords={() => {
          setWordsMap(StorageService.getWordsMap());
          setWordsList(StorageService.getWordRecords());
        }}
        onClose={() => setIsVocabOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onSave={handleSaveSettings}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};

export default App;
