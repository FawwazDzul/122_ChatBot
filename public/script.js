/**
 * ============================================================================
 * AI ChatBot 122 - Script Utama (Frontend Interaktif)
 * ============================================================================
 * Fitur:
 * - Real-time SSE (Server-Sent Events) Streaming dari backend /api/chat
 * - State Management Percakapan Lokal (localStorage)
 * - Dukungan Markdown Lengkap + Syntax Highlighting & Tombol Salin Kode
 * - Text-to-Speech (Dengar Respon AI) & Speech-to-Text (Voice Input)
 * - Efek Suara Web Audio API Sintesis (Tanpa file eksternal)
 * - Tema Gelap & Terang (Dark & Light Mode) dengan persistence
 * - Ekspor Chat ke format Markdown (.md)
 * - Desain Responsif & Interaksi Halus
 * ============================================================================
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. STATE & STORAGE MANAGEMENT
  // ==========================================================================

  const STORAGE_KEYS = {
    CONVERSATIONS: 'chatbot_122_conversations',
    ACTIVE_CHAT_ID: 'chatbot_122_active_id',
    THEME: 'chatbot_122_theme',
    SOUND: 'chatbot_122_sound_enabled'
  };

  const AppState = {
    conversations: [],
    activeChatId: null,
    isGenerating: false,
    abortController: null,
    soundEnabled: true,
    theme: 'dark',
    recognition: null,
    isListening: false,
    activeSpeechUtterance: null
  };

  // ==========================================================================
  // 2. DOM ELEMENTS
  // ==========================================================================

  const DOM = {
    // Sidebar
    sidebar: document.getElementById('sidebar'),
    sidebarOverlay: document.getElementById('sidebarOverlay'),
    closeSidebarBtn: document.getElementById('closeSidebarBtn'),
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    newChatBtn: document.getElementById('newChatBtn'),
    searchHistoryInput: document.getElementById('searchHistoryInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    historyList: document.getElementById('historyList'),
    chatCountBadge: document.getElementById('chatCountBadge'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    soundToggleBtn: document.getElementById('soundToggleBtn'),
    infoBtn: document.getElementById('infoBtn'),
    clearAllBtn: document.getElementById('clearAllBtn'),

    // Top Navigation
    currentChatTitle: document.getElementById('currentChatTitle'),
    chatStatus: document.getElementById('chatStatus'),
    exportChatBtn: document.getElementById('exportChatBtn'),
    clearCurrentChatBtn: document.getElementById('clearCurrentChatBtn'),

    // Main Chat Viewport
    messagesViewport: document.getElementById('messagesViewport'),
    welcomeScreen: document.getElementById('welcomeScreen'),
    messagesContainer: document.getElementById('messagesContainer'),
    typingIndicator: document.getElementById('typingIndicator'),
    stopGeneratingBtn: document.getElementById('stopGeneratingBtn'),
    scrollBottomBtn: document.getElementById('scrollBottomBtn'),

    // Input Area
    voiceInputBtn: document.getElementById('voiceInputBtn'),
    userInput: document.getElementById('userInput'),
    charCount: document.getElementById('charCount'),
    sendBtn: document.getElementById('sendBtn'),

    // Modals
    infoModal: document.getElementById('infoModal'),
    closeInfoModalBtn: document.getElementById('closeInfoModalBtn'),
    confirmInfoModalBtn: document.getElementById('confirmInfoModalBtn'),
    confirmModal: document.getElementById('confirmModal'),
    closeConfirmModalBtn: document.getElementById('closeConfirmModalBtn'),
    cancelConfirmBtn: document.getElementById('cancelConfirmBtn'),
    executeConfirmBtn: document.getElementById('executeConfirmBtn'),
    confirmModalTitle: document.getElementById('confirmModalTitle'),
    confirmModalMessage: document.getElementById('confirmModalMessage'),

    // Toasts
    toastContainer: document.getElementById('toastContainer')
  };

  // ==========================================================================
  // 3. SOUND SYNTHESIZER (WEB AUDIO API)
  // ==========================================================================

  let audioCtx = null;

  function initAudio() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
  }

  function playTone(type) {
    if (!AppState.soundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'send') {
        // Melodi lembut naik untuk pesan terkirim
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(660, now + 0.12);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'receive') {
        // Chime lembut untuk respon selesai
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'pop') {
        // Klik halus untuk interaksi tombol
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      }
    } catch (e) {
      // Abaikan jika browser membatasi audio autoplay
    }
  }

  // ==========================================================================
  // 4. TOAST NOTIFICATION SYSTEM
  // ==========================================================================

  function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-circle-exclamation';

    toast.innerHTML = `
      <i class="fa-solid ${iconClass}"></i>
      <div class="toast-message">${escapeHtml(message)}</div>
    `;

    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ==========================================================================
  // 5. HELPER FUNCTIONS
  // ==========================================================================

  function generateId() {
    return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  function escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp || Date.now());
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Safe Markdown Parser (Uses Marked if available, fallback with built-in rules)
  function renderMarkdown(content) {
    if (!content) return '';

    if (window.marked && typeof window.marked.parse === 'function') {
      try {
        marked.setOptions({
          breaks: true,
          gfm: true
        });
        return marked.parse(content);
      } catch (err) {
        console.warn('Marked.js error, using fallback parser:', err);
      }
    }

    // Fallback lightweight markdown parser
    let html = escapeHtml(content);

    // Code blocks with syntax wrapper
    html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const language = lang || 'code';
      return `
        <div class="code-block-wrapper">
          <div class="code-block-header">
            <div class="code-dots">
              <span class="code-dot dot-red"></span>
              <span class="code-dot dot-yellow"></span>
              <span class="code-dot dot-green"></span>
            </div>
            <span class="code-language">${language}</span>
            <button class="copy-code-btn" title="Salin Kode">
              <i class="fa-regular fa-copy"></i>
              <span>Salin</span>
            </button>
          </div>
          <pre><code class="language-${language}">${code}</code></pre>
        </div>
      `;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold & Italic
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Blockquotes
    html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Line breaks to paragraphs
    const paragraphs = html.split(/\n\s*\n/).map(p => {
      if (p.startsWith('<div class="code-block-wrapper"') || p.startsWith('<h1>') || p.startsWith('<h2>') || p.startsWith('<h3>')) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    });

    return paragraphs.join('');
  }

  // Enhance code blocks generated by marked
  function enhanceRenderedMarkdown(container) {
    // If marked rendered regular <pre><code>, wrap them nicely
    const preBlocks = container.querySelectorAll('pre');
    preBlocks.forEach(pre => {
      if (pre.parentElement.classList.contains('code-block-wrapper')) return;

      const code = pre.querySelector('code');
      let lang = 'code';
      if (code && code.className) {
        const match = code.className.match(/language-(\w+)/);
        if (match) lang = match[1];
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';

      const header = document.createElement('div');
      header.className = 'code-block-header';
      header.innerHTML = `
        <div class="code-dots">
          <span class="code-dot dot-red"></span>
          <span class="code-dot dot-yellow"></span>
          <span class="code-dot dot-green"></span>
        </div>
        <span class="code-language">${lang}</span>
        <button class="copy-code-btn" title="Salin Kode">
          <i class="fa-regular fa-copy"></i>
          <span>Salin</span>
        </button>
      `;

      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(header);
      wrapper.appendChild(pre);

      if (window.hljs && code) {
        try {
          hljs.highlightElement(code);
        } catch (e) {}
      }
    });

    // Attach copy buttons
    container.querySelectorAll('.copy-code-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const wrapper = btn.closest('.code-block-wrapper');
        const codeElem = wrapper ? wrapper.querySelector('pre code') : null;
        if (codeElem) {
          navigator.clipboard.writeText(codeElem.innerText).then(() => {
            btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Disalin!</span>';
            btn.style.color = '#10b981';
            setTimeout(() => {
              btn.innerHTML = '<i class="fa-regular fa-copy"></i> <span>Salin</span>';
              btn.style.color = '';
            }, 2000);
          }).catch(() => {
            showToast('Gagal menyalin kode', 'error');
          });
        }
      };
    });
  }

  // ==========================================================================
  // 6. CONVERSATION DATA & STORAGE
  // ==========================================================================

  function loadStoredData() {
    try {
      const storedChats = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
      AppState.conversations = storedChats ? JSON.parse(storedChats) : [];
      
      const storedActiveId = localStorage.getItem(STORAGE_KEYS.ACTIVE_CHAT_ID);
      AppState.activeChatId = storedActiveId || null;

      const storedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
      if (storedTheme === 'light' || storedTheme === 'dark') {
        AppState.theme = storedTheme;
      }

      const storedSound = localStorage.getItem(STORAGE_KEYS.SOUND);
      if (storedSound !== null) {
        AppState.soundEnabled = storedSound === 'true';
      }
    } catch (e) {
      console.error('Gagal membaca localStorage:', e);
      AppState.conversations = [];
    }

    applyTheme(AppState.theme);
    updateSoundUI();
  }

  function saveConversations() {
    try {
      localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(AppState.conversations));
      if (AppState.activeChatId) {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_CHAT_ID, AppState.activeChatId);
      } else {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_CHAT_ID);
      }
    } catch (e) {
      console.error('Gagal menyimpan ke localStorage:', e);
    }
  }

  function getActiveConversation() {
    return AppState.conversations.find(c => c.id === AppState.activeChatId);
  }

  function createNewConversation(initialTitle = 'Percakapan Baru') {
    const newChat = {
      id: generateId(),
      title: initialTitle,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };

    AppState.conversations.unshift(newChat);
    AppState.activeChatId = newChat.id;
    saveConversations();
    renderHistoryList();
    renderActiveConversation();

    playTone('pop');
    return newChat;
  }

  function deleteConversation(chatId) {
    const index = AppState.conversations.findIndex(c => c.id === chatId);
    if (index === -1) return;

    AppState.conversations.splice(index, 1);

    if (AppState.activeChatId === chatId) {
      if (AppState.conversations.length > 0) {
        AppState.activeChatId = AppState.conversations[0].id;
      } else {
        createNewConversation();
        return;
      }
    }

    saveConversations();
    renderHistoryList();
    renderActiveConversation();
    showToast('Percakapan dihapus', 'info');
  }

  function clearAllConversations() {
    AppState.conversations = [];
    createNewConversation();
    showToast('Semua riwayat percakapan telah dibersihkan', 'info');
  }

  // ==========================================================================
  // 7. UI RENDERING: SIDEBAR HISTORY
  // ==========================================================================

  function renderHistoryList(filterQuery = '') {
    DOM.historyList.innerHTML = '';
    const query = filterQuery.toLowerCase().trim();

    const filtered = AppState.conversations.filter(chat => {
      if (!query) return true;
      const titleMatch = chat.title.toLowerCase().includes(query);
      const messageMatch = chat.messages.some(m => m.content.toLowerCase().includes(query));
      return titleMatch || messageMatch;
    });

    DOM.chatCountBadge.textContent = AppState.conversations.length;

    if (filtered.length === 0) {
      DOM.historyList.innerHTML = `
        <div class="history-empty-state">
          <i class="fa-regular fa-comments"></i>
          <p>${query ? 'Tidak ada hasil ditemukan' : 'Belum ada riwayat chat'}</p>
        </div>
      `;
      return;
    }

    filtered.forEach(chat => {
      const item = document.createElement('div');
      item.className = `history-item ${chat.id === AppState.activeChatId ? 'active' : ''}`;
      item.dataset.id = chat.id;

      item.innerHTML = `
        <i class="fa-regular fa-message chat-icon"></i>
        <span class="history-item-title" title="${escapeHtml(chat.title)}">${escapeHtml(chat.title)}</span>
        <div class="history-item-actions">
          <button class="history-action-btn edit-title-btn" title="Ubah Nama">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="history-action-btn delete-btn" title="Hapus Chat">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      `;

      // Select chat click
      item.addEventListener('click', (e) => {
        if (e.target.closest('.history-action-btn')) return;
        if (AppState.activeChatId !== chat.id) {
          switchConversation(chat.id);
        }
        closeSidebarOnMobile();
      });

      // Edit title
      const editBtn = item.querySelector('.edit-title-btn');
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        promptRenameConversation(chat.id);
      });

      // Delete single chat
      const deleteBtn = item.querySelector('.delete-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openConfirmModal('Hapus Percakapan', `Hapus percakapan "${chat.title}"?`, () => {
          deleteConversation(chat.id);
        });
      });

      DOM.historyList.appendChild(item);
    });
  }

  function switchConversation(chatId) {
    if (AppState.isGenerating) {
      stopGeneration();
    }
    AppState.activeChatId = chatId;
    saveConversations();
    renderHistoryList();
    renderActiveConversation();
    playTone('pop');
  }

  function promptRenameConversation(chatId) {
    const chat = AppState.conversations.find(c => c.id === chatId);
    if (!chat) return;

    const newTitle = prompt('Masukkan nama baru percakapan:', chat.title);
    if (newTitle && newTitle.trim()) {
      chat.title = newTitle.trim();
      saveConversations();
      renderHistoryList();
      if (chat.id === AppState.activeChatId) {
        DOM.currentChatTitle.textContent = chat.title;
      }
      showToast('Nama percakapan diperbarui', 'success');
    }
  }

  // ==========================================================================
  // 8. UI RENDERING: ACTIVE CHAT MESSAGES
  // ==========================================================================

  function renderActiveConversation() {
    const chat = getActiveConversation();
    if (!chat) return;

    DOM.currentChatTitle.textContent = chat.title || 'Percakapan Baru';
    DOM.messagesContainer.innerHTML = '';

    if (!chat.messages || chat.messages.length === 0) {
      DOM.welcomeScreen.style.display = 'block';
      DOM.messagesContainer.style.display = 'none';
    } else {
      DOM.welcomeScreen.style.display = 'none';
      DOM.messagesContainer.style.display = 'flex';

      chat.messages.forEach(msg => {
        appendMessageElement(msg, false);
      });
    }

    scrollToBottom();
  }

  function appendMessageElement(msg, shouldScroll = true) {
    DOM.welcomeScreen.style.display = 'none';
    DOM.messagesContainer.style.display = 'flex';

    const row = document.createElement('div');
    row.className = `message-row ${msg.role === 'user' ? 'user' : 'bot'}`;
    row.id = `msg_${msg.id}`;

    const authorName = msg.role === 'user' ? 'Anda' : 'ChatBot 122';
    const avatarIcon = msg.role === 'user' ? 'fa-solid fa-user' : 'fa-solid fa-robot';

    row.innerHTML = `
      <div class="message-avatar">
        <i class="${avatarIcon}"></i>
      </div>
      <div class="message-bubble-wrapper">
        <div class="message-header-info">
          <span class="message-author">${authorName}</span>
          <span class="message-time">${formatTime(msg.timestamp)}</span>
        </div>
        <div class="message-bubble">
          ${renderMarkdown(msg.content)}
        </div>
        <div class="message-actions">
          <button class="msg-action-btn copy-msg-btn" title="Salin Pesan">
            <i class="fa-regular fa-copy"></i>
            <span>Salin</span>
          </button>
          <button class="msg-action-btn tts-msg-btn" title="Dengarkan Suara (TTS)">
            <i class="fa-solid fa-volume-high"></i>
            <span>Dengar</span>
          </button>
          ${msg.role === 'assistant' ? `
            <button class="msg-action-btn regen-msg-btn" title="Buat Ulang Jawaban">
              <i class="fa-solid fa-arrows-rotate"></i>
              <span>Regenerasi</span>
            </button>
          ` : ''}
        </div>
      </div>
    `;

    // Attach Action Listeners
    const copyBtn = row.querySelector('.copy-msg-btn');
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(msg.content).then(() => {
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Disalin!</span>';
        setTimeout(() => {
          copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> <span>Salin</span>';
        }, 2000);
        showToast('Pesan disalin ke clipboard', 'success');
      });
    });

    const ttsBtn = row.querySelector('.tts-msg-btn');
    ttsBtn.addEventListener('click', () => {
      toggleTextToSpeech(msg.content, ttsBtn);
    });

    const regenBtn = row.querySelector('.regen-msg-btn');
    if (regenBtn) {
      regenBtn.addEventListener('click', () => {
        regenerateBotResponse(msg.id);
      });
    }

    DOM.messagesContainer.appendChild(row);
    enhanceRenderedMarkdown(row);

    if (shouldScroll) {
      scrollToBottom();
    }
  }

  function updateBotMessageContent(msgId, content) {
    const row = document.getElementById(`msg_${msgId}`);
    if (!row) return;

    const bubble = row.querySelector('.message-bubble');
    if (bubble) {
      bubble.innerHTML = renderMarkdown(content);
      enhanceRenderedMarkdown(bubble);
    }
  }

  function scrollToBottom(force = false) {
    if (force) {
      DOM.messagesViewport.scrollTop = DOM.messagesViewport.scrollHeight;
      return;
    }
    // Hanya scroll jika user tidak sedang melihat ke atas
    const isScrolledUp = DOM.messagesViewport.scrollHeight - DOM.messagesViewport.scrollTop - DOM.messagesViewport.clientHeight > 150;
    if (!isScrolledUp) {
      DOM.messagesViewport.scrollTop = DOM.messagesViewport.scrollHeight;
    }
  }

  // ==========================================================================
  // 9. API & STREAMING COMMUNICATION
  // ==========================================================================

  /**
   * Catatan Penting Mengenai Backend (index.js):
   * Backend mengharapkan payload berupa:
   * req.body.message = { message: [ { role: 'user', content: '...' } ] }
   * dan merespon dalam bentuk Server-Sent Events (SSE) dengan 'data: ...'
   */
  async function sendMessage(userText) {
    const text = userText || DOM.userInput.value.trim();
    if (!text || AppState.isGenerating) return;

    // Reset Input
    DOM.userInput.value = '';
    adjustTextareaHeight();
    updateCharCounter();
    DOM.sendBtn.disabled = true;

    // Pastikan ada percakapan aktif
    let chat = getActiveConversation();
    if (!chat) {
      chat = createNewConversation();
    }

    // Update judul chat otomatis jika ini adalah pesan pertama
    if (chat.messages.length === 0) {
      const generatedTitle = text.length > 32 ? text.substring(0, 32) + '...' : text;
      chat.title = generatedTitle;
      DOM.currentChatTitle.textContent = generatedTitle;
    }

    // 1. Tambah Pesan User ke State
    const userMsg = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    };
    chat.messages.push(userMsg);
    chat.updatedAt = Date.now();
    saveConversations();
    renderHistoryList();
    appendMessageElement(userMsg, true);
    playTone('send');

    // 2. Siapkan Pesan Bot Sementara (Kosong)
    const botMsgId = generateId();
    const botMsg = {
      id: botMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    };
    chat.messages.push(botMsg);
    saveConversations();
    appendMessageElement(botMsg, true);

    // 3. Update Status UI
    setGeneratingState(true);

    // Siapkan riwayat pesan untuk dikirim ke backend
    const apiMessages = chat.messages
      .slice(0, -1) // kecualikan pesan bot kosong yang baru dibuat
      .map(m => ({
        role: m.role,
        content: m.content
      }));

    AppState.abortController = new AbortController();
    let accumulatedContent = '';

    try {
      /**
       * Payload disesuaikan persis dengan index.js:
       * const { message } = req.body.message;
       * if (!message || !Array.isArray(message)) ...
       */
      const requestPayload = {
        message: {
          message: apiMessages
        }
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload),
        signal: AppState.abortController.signal
      });

      if (!response.ok) {
        let errMessage = 'Terjadi kesalahan saat memproses permintaan.';
        try {
          const errJson = await response.json();
          errMessage = errJson.error || errMessage;
        } catch (_) {
          const errText = await response.text();
          if (errText) errMessage = errText;
        }
        throw new Error(errMessage);
      }

      // Membaca Streaming SSE
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // simpan bagian potongan tak lengkap

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (!trimmed.startsWith('data:')) continue;

          const dataContent = trimmed.replace(/^data:\s*/, '');
          if (dataContent === '[DONE]') {
            break;
          }

          try {
            const parsed = JSON.parse(dataContent);
            if (typeof parsed === 'string') {
              accumulatedContent += parsed;
            } else if (parsed && typeof parsed.content === 'string') {
              accumulatedContent += parsed.content;
            } else {
              accumulatedContent += JSON.stringify(parsed);
            }
          } catch (e) {
            // Jika dataContent adalah teks biasa
            accumulatedContent += dataContent;
          }

          botMsg.content = accumulatedContent;
          updateBotMessageContent(botMsgId, accumulatedContent);
          scrollToBottom();
        }
      }

      // Jika response selesai namun konten kosong (misal karena respons backend)
      if (!accumulatedContent.trim()) {
        accumulatedContent = 'Respon telah diterima dari model AI.';
        botMsg.content = accumulatedContent;
        updateBotMessageContent(botMsgId, accumulatedContent);
      }

      playTone('receive');

    } catch (err) {
      if (err.name === 'AbortError') {
        accumulatedContent += '\n\n*(Respon dihentikan oleh pengguna)*';
        botMsg.content = accumulatedContent;
        updateBotMessageContent(botMsgId, accumulatedContent);
        showToast('Respon dihentikan', 'info');
      } else {
        console.error('Chat error:', err);
        const errorNote = `\n\n> ⚠️ **Error:** ${err.message || 'Gagal terhubung ke server.'}`;
        accumulatedContent += errorNote;
        botMsg.content = accumulatedContent;
        updateBotMessageContent(botMsgId, accumulatedContent);
        showToast('Terjadi kendala saat komunikasi dengan AI', 'error');
      }
    } finally {
      chat.updatedAt = Date.now();
      saveConversations();
      setGeneratingState(false);
      scrollToBottom();
    }
  }

  function setGeneratingState(isGenerating) {
    AppState.isGenerating = isGenerating;
    if (isGenerating) {
      DOM.typingIndicator.style.display = 'flex';
      DOM.stopGeneratingBtn.style.display = 'flex';
      DOM.chatStatus.querySelector('.status-text').textContent = 'AI sedang merespon...';
      DOM.chatStatus.querySelector('.status-indicator').style.backgroundColor = 'var(--primary)';
    } else {
      DOM.typingIndicator.style.display = 'none';
      DOM.stopGeneratingBtn.style.display = 'none';
      DOM.chatStatus.querySelector('.status-text').textContent = 'Siap membantu Anda';
      DOM.chatStatus.querySelector('.status-indicator').style.backgroundColor = 'var(--success)';
      AppState.abortController = null;
    }
  }

  function stopGeneration() {
    if (AppState.abortController) {
      AppState.abortController.abort();
    }
  }

  function regenerateBotResponse(botMsgId) {
    if (AppState.isGenerating) return;

    const chat = getActiveConversation();
    if (!chat) return;

    const botIndex = chat.messages.findIndex(m => m.id === botMsgId);
    if (botIndex <= 0) return;

    const prevUserMsg = chat.messages[botIndex - 1];
    if (!prevUserMsg || prevUserMsg.role !== 'user') return;

    // Hapus pesan bot ini dan pesan-pesan setelahnya
    chat.messages.splice(botIndex);
    saveConversations();
    renderActiveConversation();

    // Kirim kembali pesan user
    sendMessage(prevUserMsg.content);
  }

  // ==========================================================================
  // 10. TEXT-TO-SPEECH (TTS) & VOICE INPUT (SPEECH-TO-TEXT)
  // ==========================================================================

  function toggleTextToSpeech(text, btnElement) {
    if (!('speechSynthesis' in window)) {
      showToast('Browser Anda tidak mendukung Text-to-Speech', 'error');
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      if (btnElement) {
        btnElement.classList.remove('active');
        btnElement.innerHTML = '<i class="fa-solid fa-volume-high"></i> <span>Dengar</span>';
      }
      return;
    }

    // Bersihkan format markdown dari teks sebelum dibaca
    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'blok kode program')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/#+\s/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'id-ID';
    utterance.rate = 1.0;

    // Pilih suara Indonesia jika ada
    const voices = window.speechSynthesis.getVoices();
    const indonesianVoice = voices.find(v => v.lang.includes('id') || v.lang.includes('ID'));
    if (indonesianVoice) {
      utterance.voice = indonesianVoice;
    }

    btnElement.classList.add('active');
    btnElement.innerHTML = '<i class="fa-solid fa-stop"></i> <span>Berhenti</span>';

    utterance.onend = () => {
      btnElement.classList.remove('active');
      btnElement.innerHTML = '<i class="fa-solid fa-volume-high"></i> <span>Dengar</span>';
    };

    utterance.onerror = () => {
      btnElement.classList.remove('active');
      btnElement.innerHTML = '<i class="fa-solid fa-volume-high"></i> <span>Dengar</span>';
    };

    window.speechSynthesis.speak(utterance);
  }

  function initSpeechRecognition() {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      DOM.voiceInputBtn.style.opacity = '0.5';
      DOM.voiceInputBtn.title = 'Voice input tidak didukung browser ini';
      return;
    }

    AppState.recognition = new SpeechRecognitionClass();
    AppState.recognition.lang = 'id-ID';
    AppState.recognition.continuous = false;
    AppState.recognition.interimResults = false;

    AppState.recognition.onstart = () => {
      AppState.isListening = true;
      DOM.voiceInputBtn.classList.add('listening');
      showToast('Mendengarkan suara Anda...', 'info');
    };

    AppState.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) {
        DOM.userInput.value = DOM.userInput.value ? `${DOM.userInput.value} ${transcript}` : transcript;
        adjustTextareaHeight();
        updateCharCounter();
        DOM.sendBtn.disabled = false;
        showToast('Suara berhasil diubah ke teks', 'success');
      }
    };

    AppState.recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      AppState.isListening = false;
      DOM.voiceInputBtn.classList.remove('listening');
      if (event.error !== 'no-speech') {
        showToast(`Mic error: ${event.error}`, 'error');
      }
    };

    AppState.recognition.onend = () => {
      AppState.isListening = false;
      DOM.voiceInputBtn.classList.remove('listening');
    };
  }

  function toggleVoiceInput() {
    if (!AppState.recognition) {
      showToast('Browser Anda tidak mendukung Web Speech Recognition', 'error');
      return;
    }

    if (AppState.isListening) {
      AppState.recognition.stop();
    } else {
      try {
        AppState.recognition.start();
      } catch (e) {
        console.warn('Recognition start error:', e);
      }
    }
  }

  // ==========================================================================
  // 11. THEME & SOUND CONTROLS
  // ==========================================================================

  function applyTheme(theme) {
    AppState.theme = theme;
    document.body.className = `theme-${theme}`;
    localStorage.setItem(STORAGE_KEYS.THEME, theme);

    if (DOM.themeToggleBtn) {
      DOM.themeToggleBtn.innerHTML = theme === 'dark' 
        ? '<i class="fa-solid fa-moon"></i>' 
        : '<i class="fa-solid fa-sun"></i>';
    }
  }

  function toggleTheme() {
    const nextTheme = AppState.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    playTone('pop');
    showToast(`Mode ${nextTheme === 'dark' ? 'Gelap' : 'Terang'} diaktifkan`, 'info');
  }

  function updateSoundUI() {
    if (DOM.soundToggleBtn) {
      DOM.soundToggleBtn.innerHTML = AppState.soundEnabled
        ? '<i class="fa-solid fa-volume-high"></i>'
        : '<i class="fa-solid fa-volume-xmark"></i>';
    }
  }

  function toggleSound() {
    AppState.soundEnabled = !AppState.soundEnabled;
    localStorage.setItem(STORAGE_KEYS.SOUND, AppState.soundEnabled);
    updateSoundUI();
    if (AppState.soundEnabled) playTone('pop');
    showToast(`Efek suara ${AppState.soundEnabled ? 'diaktifkan' : 'dimatikan'}`, 'info');
  }

  // ==========================================================================
  // 12. EXPORT CHAT
  // ==========================================================================

  function exportCurrentChatToMarkdown() {
    const chat = getActiveConversation();
    if (!chat || !chat.messages || chat.messages.length === 0) {
      showToast('Tidak ada pesan untuk diekspor', 'info');
      return;
    }

    let md = `# ${chat.title}\n`;
    md += `*Tanggal Dibuat: ${new Date(chat.createdAt).toLocaleString()}*\n\n---\n\n`;

    chat.messages.forEach(msg => {
      const sender = msg.role === 'user' ? '👤 **Anda**' : '🤖 **ChatBot 122**';
      const time = new Date(msg.timestamp).toLocaleTimeString();
      md += `### ${sender} _(${time})_\n\n${msg.content}\n\n---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanFileName = chat.title.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
    a.download = `ChatBot_122_${cleanFileName || 'Percakapan'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Percakapan berhasil diekspor ke Markdown (.md)', 'success');
  }

  // ==========================================================================
  // 13. MODALS LOGIC
  // ==========================================================================

  let pendingConfirmCallback = null;

  function openConfirmModal(title, message, callback) {
    DOM.confirmModalTitle.textContent = title;
    DOM.confirmModalMessage.textContent = message;
    pendingConfirmCallback = callback;
    DOM.confirmModal.style.display = 'flex';
  }

  function closeConfirmModal() {
    DOM.confirmModal.style.display = 'none';
    pendingConfirmCallback = null;
  }

  function openInfoModal() {
    DOM.infoModal.style.display = 'flex';
  }

  function closeInfoModal() {
    DOM.infoModal.style.display = 'none';
  }

  // ==========================================================================
  // 14. INPUT & TEXTAREA HANDLING
  // ==========================================================================

  function adjustTextareaHeight() {
    DOM.userInput.style.height = 'auto';
    const newHeight = Math.min(DOM.userInput.scrollHeight, 180);
    DOM.userInput.style.height = `${newHeight}px`;
  }

  function updateCharCounter() {
    const len = DOM.userInput.value.length;
    DOM.charCount.textContent = `${len}/4000`;
    DOM.sendBtn.disabled = len === 0 || DOM.userInput.value.trim().length === 0 || AppState.isGenerating;
  }

  // ==========================================================================
  // 15. MOBILE SIDEBAR LOGIC
  // ==========================================================================

  function openSidebarOnMobile() {
    DOM.sidebar.classList.add('open');
    DOM.sidebarOverlay.classList.add('active');
  }

  function closeSidebarOnMobile() {
    DOM.sidebar.classList.remove('open');
    DOM.sidebarOverlay.classList.remove('active');
  }

  // ==========================================================================
  // 16. EVENT LISTENERS
  // ==========================================================================

  function setupEventListeners() {
    // New Chat
    DOM.newChatBtn.addEventListener('click', () => {
      createNewConversation();
      closeSidebarOnMobile();
      DOM.userInput.focus();
    });

    // Mobile Sidebar Toggles
    DOM.mobileMenuBtn.addEventListener('click', openSidebarOnMobile);
    DOM.closeSidebarBtn.addEventListener('click', closeSidebarOnMobile);
    DOM.sidebarOverlay.addEventListener('click', closeSidebarOnMobile);

    // Search History Filter
    DOM.searchHistoryInput.addEventListener('input', (e) => {
      const q = e.target.value;
      DOM.clearSearchBtn.style.display = q ? 'block' : 'none';
      renderHistoryList(q);
    });

    DOM.clearSearchBtn.addEventListener('click', () => {
      DOM.searchHistoryInput.value = '';
      DOM.clearSearchBtn.style.display = 'none';
      renderHistoryList('');
      DOM.searchHistoryInput.focus();
    });

    // Sidebar Footer Controls
    DOM.themeToggleBtn.addEventListener('click', toggleTheme);
    DOM.soundToggleBtn.addEventListener('click', toggleSound);
    DOM.infoBtn.addEventListener('click', openInfoModal);
    DOM.clearAllBtn.addEventListener('click', () => {
      openConfirmModal(
        'Hapus Semua Riwayat',
        'Apakah Anda yakin ingin menghapus seluruh riwayat percakapan? Tindakan ini tidak dapat dikembalikan.',
        clearAllConversations
      );
    });

    // Top Navigation Actions
    DOM.exportChatBtn.addEventListener('click', exportCurrentChatToMarkdown);
    DOM.clearCurrentChatBtn.addEventListener('click', () => {
      const chat = getActiveConversation();
      if (!chat || chat.messages.length === 0) return;
      openConfirmModal(
        'Bersihkan Percakapan',
        `Hapus semua pesan dalam percakapan "${chat.title}"?`,
        () => {
          chat.messages = [];
          chat.updatedAt = Date.now();
          saveConversations();
          renderActiveConversation();
          showToast('Pesan percakapan telah dibersihkan', 'info');
        }
      );
    });

    // Input Area
    DOM.userInput.addEventListener('input', () => {
      adjustTextareaHeight();
      updateCharCounter();
    });

    DOM.userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    DOM.sendBtn.addEventListener('click', () => {
      sendMessage();
    });

    // Voice Input Button
    DOM.voiceInputBtn.addEventListener('click', toggleVoiceInput);

    // Floating Controls
    DOM.stopGeneratingBtn.addEventListener('click', stopGeneration);
    DOM.scrollBottomBtn.addEventListener('click', () => scrollToBottom(true));

    DOM.messagesViewport.addEventListener('scroll', () => {
      const isScrolledUp = DOM.messagesViewport.scrollHeight - DOM.messagesViewport.scrollTop - DOM.messagesViewport.clientHeight > 180;
      DOM.scrollBottomBtn.style.display = isScrolledUp ? 'flex' : 'none';
    });

    // Suggestion Cards on Welcome Screen
    document.querySelectorAll('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const promptText = card.dataset.prompt;
        if (promptText) {
          DOM.userInput.value = promptText;
          adjustTextareaHeight();
          updateCharCounter();
          sendMessage();
        }
      });
    });

    // Modals
    DOM.closeInfoModalBtn.addEventListener('click', closeInfoModal);
    DOM.confirmInfoModalBtn.addEventListener('click', closeInfoModal);
    DOM.infoModal.addEventListener('click', (e) => {
      if (e.target === DOM.infoModal) closeInfoModal();
    });

    DOM.closeConfirmModalBtn.addEventListener('click', closeConfirmModal);
    DOM.cancelConfirmBtn.addEventListener('click', closeConfirmModal);
    DOM.executeConfirmBtn.addEventListener('click', () => {
      if (typeof pendingConfirmCallback === 'function') {
        pendingConfirmCallback();
      }
      closeConfirmModal();
    });
    DOM.confirmModal.addEventListener('click', (e) => {
      if (e.target === DOM.confirmModal) closeConfirmModal();
    });

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      // Ctrl+K atau Cmd+K untuk Chat Baru
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        createNewConversation();
        closeSidebarOnMobile();
        DOM.userInput.focus();
      }
      // Esc untuk tutup modal
      if (e.key === 'Escape') {
        closeInfoModal();
        closeConfirmModal();
        closeSidebarOnMobile();
      }
    });
  }

  // ==========================================================================
  // 17. INITIALIZATION
  // ==========================================================================

  function initApp() {
    loadStoredData();

    // Pastikan setidaknya ada satu percakapan
    if (!AppState.conversations || AppState.conversations.length === 0) {
      createNewConversation();
    } else {
      if (!AppState.activeChatId || !getActiveConversation()) {
        AppState.activeChatId = AppState.conversations[0].id;
      }
      renderHistoryList();
      renderActiveConversation();
    }

    setupEventListeners();
    initSpeechRecognition();

    // Auto focus textarea
    setTimeout(() => {
      if (DOM.userInput) DOM.userInput.focus();
    }, 200);
  }

  // Run on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
