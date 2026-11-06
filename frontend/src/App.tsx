import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  BookOpen,
  Settings,
  Plus
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
  const [settings, setSettings] = useState<AppSettings>(() => StorageService.getSettings());
  const [chats, setChats] = useState<ChatSession[]>(() => StorageService.getChats());
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    const saved = StorageService.getActiveChatId();
    if (saved) return saved;
    const existing = StorageService.getChats();
    return existing[0]?.id || null;
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const active = StorageService.getActiveChatId();
    if (active) return StorageService.getMessages(active);
    return [];
  });

  const [wordsMap, setWordsMap] = useState<WordMap>(() => StorageService.getWordsMap());
  const [wordsList, setWordsList] = useState<WordRecord[]>(() => StorageService.getWordRecords());

  const [loading, setLoading] = useState(false);
  const [isChatsOpen, setIsChatsOpen] = useState(false);
  const [isVocabOpen, setIsVocabOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [activeWordPopover, setActiveWordPopover] = useState<{
    word: string;
    contextSentence: string;
    targetRect: DOMRect | null;
  } | null>(null);

  const [activeSelectionBar, setActiveSelectionBar] = useState<{
    phrase: string;
    targetRect: DOMRect | null;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chats.length === 0) {
      const initialChat = StorageService.createChat('Знайомство з датською');
      const initialGreeting: ChatMessage = {
        id: 'msg_welcome',
        role: 'model',
        content: 'Hej! Velkommen til FastLearn. Jeg er din dansklærer. Hvordan har du det i dag?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        model_used: settings.model,
      };
      StorageService.saveMessages(initialChat.id, [initialGreeting]);
      setChats([initialChat]);
      setActiveChatId(initialChat.id);
      setMessages([initialGreeting]);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSelectChat = (id: string) => {
    setActiveChatId(id);
    StorageService.setActiveChatId(id);
    const msgs = StorageService.getMessages(id);
    setMessages(msgs);
  };

  const handleCreateChat = () => {
    const newChat = StorageService.createChat();
    const updatedChats = StorageService.getChats();
    setChats(updatedChats);
    setActiveChatId(newChat.id);

    const greeting: ChatMessage = {
      id: 'msg_' + Math.random().toString(36).substring(2, 9),
      role: 'model',
      content: 'Hej! Hvad vil du tale om i dag? Vi kan tale om hverdagen, vejret eller mad.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      model_used: settings.model,
    };
    StorageService.saveMessages(newChat.id, [greeting]);
    setMessages([greeting]);
  };

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

  const handleWordClick = (word: string, contextSentence: string, targetRect: DOMRect) => {
    setActiveSelectionBar(null);
    setActiveWordPopover({
      word,
      contextSentence,
      targetRect,
    });
  };

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

  const handlePhraseSelect = (phraseText: string, targetRect: DOMRect) => {
    setActiveWordPopover(null);
    setActiveSelectionBar({
      phrase: phraseText,
      targetRect,
    });
  };

  const handleSavePhrase = (phrase: string, translation: string) => {
    const clean = cleanDanishWord(phrase);
    StorageService.saveWord({
      word: phrase,
      word_clean: clean,
      status: 1,
      translation_uk: translation,
    });
    setWordsMap(StorageService.getWordsMap());
    setWordsList(StorageService.getWordRecords());
  };

  const handleSaveSettings = (updated: Partial<AppSettings>) => {
    const finalSettings = StorageService.saveSettings(updated);
    setSettings(finalSettings);
  };

  const handleDeleteWord = (wordClean: string) => {
    StorageService.deleteWord(wordClean);
    setWordsMap(StorageService.getWordsMap());
    setWordsList(StorageService.getWordRecords());
  };

  const activeChat = chats.find((c) => c.id === activeChatId);

  return (
    <div className="flex flex-col h-screen bg-[#fbfbfa] text-stone-900 antialiased selection:bg-stone-900 selection:text-white">
      {/* Sleek, Single-Tier Calm Header */}
      <header className="border-b border-stone-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 h-12 flex items-center justify-between">
          {/* Brand & Active Chat */}
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-semibold text-sm tracking-tight text-stone-900 shrink-0">
              FastLearn
            </span>
            <span className="text-stone-300">/</span>
            <button
              onClick={() => setIsChatsOpen(true)}
              className="text-xs text-stone-600 hover:text-stone-900 truncate max-w-[120px] sm:max-w-[200px] text-left transition-colors"
              title="Перемкнути розмову"
            >
              {activeChat?.title || 'Діалог'}
            </button>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 shrink-0">
              {settings.level}
            </span>
          </div>

          {/* Action Icons */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            <button
              onClick={handleCreateChat}
              className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors"
              title="Новий діалог"
              aria-label="Нова бесіда"
            >
              <Plus className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsChatsOpen(true)}
              className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors relative"
              title="Всі розмови"
              aria-label="Діалоги"
            >
              <MessageSquare className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsVocabOpen(true)}
              className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors flex items-center gap-1 text-xs font-mono"
              title="Словник слів"
              aria-label="Словник"
            >
              <BookOpen className="w-4 h-4" />
              {wordsList.length > 0 && (
                <span className="text-[11px] text-stone-600 font-medium">
                  {wordsList.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors relative"
              title="Налаштування"
              aria-label="Налаштування"
            >
              <Settings className="w-4 h-4" />
              {!settings.apiKey && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Gentle notice if Gemini key is missing */}
      {!settings.apiKey && (
        <ApiKeyBanner onOpenSettings={() => setIsSettingsOpen(true)} />
      )}

      {/* Main Conversation Stream */}
      <main className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="max-w-2xl mx-auto">
          {/* Calm Minimalist Empty State */}
          {messages.length === 0 ? (
            <div className="py-12 sm:py-20 text-center max-w-md mx-auto">
              <h2 className="text-base sm:text-lg font-semibold text-stone-900 tracking-tight mb-1.5">
                Практика датської мови
              </h2>
              <p className="text-xs sm:text-sm text-stone-500 mb-6 leading-relaxed">
                Живий діалог у форматі LingQ. Клікайте на будь-яке слово датською для перекладу, синонімів та вивчення.
              </p>

              <div className="space-y-1.5">
                {[
                  'Hej! Hvordan har du det i dag?',
                  'Fortæl mig lidt om København',
                  'Hvad er en typisk dansk tradition?',
                ].map((promptText, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(promptText)}
                    className="w-full p-2.5 bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 text-xs sm:text-sm rounded-lg transition-colors text-left flex items-center justify-between group"
                  >
                    <span>{promptText}</span>
                    <span className="text-stone-400 group-hover:text-stone-900 text-xs font-mono">→</span>
                  </button>
                ))}
              </div>
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
            <div className="flex items-center gap-2 mb-4 text-xs font-mono text-stone-400 px-1">
              <span className="w-1.5 h-1.5 bg-stone-900 rounded-full animate-ping" />
              <span>Тьютор друкує...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Docked Chat Input */}
      <footer className="sticky bottom-0 z-30 w-full">
        <ChatInput
          onSendMessage={handleSendMessage}
          loading={loading}
          level={settings.level}
          model={settings.model}
          hasApiKey={Boolean(settings.apiKey)}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      </footer>

      {/* Word Popover / Bottom Sheet */}
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

      {/* Selection Bar */}
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
