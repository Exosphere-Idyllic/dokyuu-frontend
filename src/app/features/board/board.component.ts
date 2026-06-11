import { Component, OnInit, OnDestroy, HostListener, inject, ViewChild, ElementRef, signal, effect } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CanvasService, BoardElement, ImageHistoryItem, ImageHistoryResult, ChatMessage } from '../../core/canvas/canvas.service';
import { AuthService } from '../../core/auth/auth.service';
import { BoardsService } from '../../core/boards/boards.service';
import { TasksService, Task } from '../../core/tasks/tasks.service';
import { HttpClient } from '@angular/common/http';
import { LoadingComponent } from '../loading/loading.component';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, firstValueFrom } from 'rxjs';
import { InteractiveBgComponent } from '../../shared/interactive-bg/interactive-bg.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingComponent, InteractiveBgComponent],
  templateUrl: './board.component.html',
})
export class BoardComponent implements OnInit, OnDestroy {
  private titleService = inject(Title);
  canvasService = inject(CanvasService);
  authService = inject(AuthService);
  boardsService = inject(BoardsService);
  tasksService = inject(TasksService);
  private http = inject(HttpClient);
  route = inject(ActivatedRoute);
  router = inject(Router);

  chatRecipientId = '';
  breakTimeRemaining = 0;
  breakInterval: any = null;

  // ─── Chat Autocomplete ─────────────────────────────────────────────────────
  showSuggestions = false;
  suggestionType: 'command' | 'mention' | null = null;
  suggestions: any[] = [];
  selectedSuggestionIndex = 0;
  private chatInputRef: HTMLInputElement | null = null;

  readonly CHAT_COMMANDS = [
    { label: '/break time <duración>', description: 'Iniciar tiempo de descanso (ej: 5m, 30s)', prefix: '/break time ', hostOnly: true },
    { label: '/break time stop', description: 'Detener el descanso activo', prefix: '/break time stop', hostOnly: true },
    { label: '/w @usuario <mensaje>', description: 'Enviar mensaje privado a un usuario', prefix: '/w @', hostOnly: false },
  ];

  // ─── Panel DMs ─────────────────────────────────────────────────────────────
  dmActiveContactId: string | null = null;
  unreadDmCount = 0;

  constructor() {
    effect(() => {
      const state = this.canvasService.breakState();
      if (this.breakInterval) {
        clearInterval(this.breakInterval);
        this.breakInterval = null;
      }
      if (state && state.endTime) {
        const updateTimer = () => {
          const diff = Math.ceil((state.endTime - Date.now()) / 1000);
          if (diff <= 0) {
            this.breakTimeRemaining = 0;
            this.canvasService.breakState.set(null);
            clearInterval(this.breakInterval);
            this.breakInterval = null;
          } else {
            this.breakTimeRemaining = diff;
          }
        };
        updateTimer();
        this.breakInterval = setInterval(updateTimer, 1000);
      } else {
        this.breakTimeRemaining = 0;
      }
    });
  }

  boardId!: string;
  isSaving = false;
  isUploadingImage = false;
  uploadError: string | null = null;
  hasRoleAccess = true;
  isLoading = true;
  showLoading = true;

  @ViewChild('loadingRef') loadingRef!: LoadingComponent;

  boardName: string = 'Cargando...';
  boardRole: string = 'Conectando...';
  isHost = false;

  // Task bubble float state & tasks UI
  showTaskBubble = false;
  taskBubbleX = 20;
  taskBubbleY = 200;
  isDraggingTaskBubble = false;
  dragBubbleStartX = 0;
  dragBubbleStartY = 0;
  showNewTaskModal = false;
  newTaskTitle = '';
  newTaskDescription = '';
  newTaskAssignedTo = '';
  boardMembers = signal<any[]>([]);


  // Panel de usuarios conectados y chat
  showUsersPanel = false;
  activeTab: 'users' | 'chat' | 'dms' = 'users';
  newMessageText = '';
  unreadMessagesCount = 0;
  kickingUserId: string | null = null;

  // Panel de historial de imágenes (izquierda)
  showHistoryPanel = false;
  showImageDropdown = false;
  isLoadingHistory = false;
  personalImages: ImageHistoryItem[] = [];
  boardImages: ImageHistoryItem[] = [];
  historyActiveSection: 'board' | 'personal' = 'board';

  // Menú contextual de click derecho
  showContextMenu = false;
  contextMenuX = 0;
  contextMenuY = 0;
  contextMenuCanvasX = 0;
  contextMenuCanvasY = 0;

  @ViewChild('imageInput') imageInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('chatMessagesContainer') chatMessagesContainer!: ElementRef;

  private cursorSubject = new Subject<{ x: number, y: number }>();
  private saveSubject = new Subject<BoardElement[]>();

  draggingId: string | null = null;
  dragOffsetX = 0;
  dragOffsetY = 0;
  resizingId: string | null = null;
  resizeStartW = 0;
  resizeStartH = 0;
  isRotatingId: string | null = null;
  mouseScreenX = 0;
  mouseScreenY = 0;

  selectedElementId: string | null = null;
  activeSubmenu: 'color' | 'layer' | 'quick' | null = null;

  isPanning = false;
  panX = 0;
  panY = 0;
  lastPanX = 0;
  lastPanY = 0;
  zoom = 1;

  isZoomingUiVisible = false;
  zoomConfig: 'active' | 'always' | 'disabled' = 'active';

  // --- Mini-map state ---
  showMinimap = true;
  minimapWidth = 200;
  minimapHeight = 120;
  isDraggingMinimap = false;
  isMinimapUiVisible = false;
  minimapConfig: 'active' | 'always' | 'disabled' = 'active';
  private zoomTimeout: any;
  private minimapTimeout: any;

  showMinimapUi() {
    this.isMinimapUiVisible = true;
    clearTimeout(this.minimapTimeout);
    this.minimapTimeout = setTimeout(() => {
      this.isMinimapUiVisible = false;
    }, 1500);
  }

  ngOnInit() {
    this.boardId = this.route.snapshot.paramMap.get('id')!;
    if (!this.boardId) {
      this.router.navigate(['/dashboard']);
      return;
    }

    const storedMinimap = localStorage.getItem('dokyuu_minimap_config');
    if (storedMinimap === 'active' || storedMinimap === 'always' || storedMinimap === 'disabled') {
      this.minimapConfig = storedMinimap;
    }

    const storedZoom = localStorage.getItem('dokyuu_zoom_config');
    if (storedZoom === 'active' || storedZoom === 'always' || storedZoom === 'disabled') {
      this.zoomConfig = storedZoom;
    }

    const token = this.authService.currentUser()?.token;
    if (!token) {
      this.router.navigate(['/auth']);
      return;
    }

    this.boardsService.getBoards().subscribe((boards: any[]) => {
      const currentBoard = boards.find(b => b._id === this.boardId);
      if (currentBoard) {
        this.boardName = currentBoard.name;
        this.isHost = currentBoard.myRole === 'host';
        this.boardRole = this.isHost ? 'Host' :
          currentBoard.myRole === 'member' ? 'Member' : 'Reader';
        this.titleService.setTitle(`Dokyuu — ${currentBoard.name}`);

        // Load tasks and members
        this.tasksService.loadMyTasks(this.boardId);
        if (this.isHost) {
          this.tasksService.loadBoardTasks(this.boardId);
          this.loadBoardMembers();
        }
      }
    });

    // Registrar callback de expulsión ANTES de conectar
    this.canvasService.onKicked = (data) => {
      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 2000); // Dar tiempo para que el usuario vea la notificación
    };

    this.canvasService.onChatMessageReceived = (msg) => {
      // Contar mensajes no leídos según el tipo
      if (msg.isPrivate) {
        // Mensaje privado: incrementar badge de DMs si no estamos en la pestaña DMs
        if (!this.showUsersPanel || this.activeTab !== 'dms') {
          this.unreadDmCount++;
        }
      } else {
        // Mensaje público: incrementar badge de chat si no estamos en la pestaña chat
        if (!this.showUsersPanel || this.activeTab !== 'chat') {
          this.unreadMessagesCount++;
        } else {
          this.scrollToBottom();
        }
      }

      if (msg.sender._id !== this.currentUserId) {
        const currentUser = this.authService.currentUser();
        if (currentUser) {
          const myName = (currentUser.displayName || '').toLowerCase().replace(/\s+/g, '');
          const myEmailPrefix = (currentUser.email || '').split('@')[0].toLowerCase();
          const cleanMessage = msg.message.toLowerCase();

          const hasMention = (myName && cleanMessage.includes('@' + myName)) ||
                              (myEmailPrefix && cleanMessage.includes('@' + myEmailPrefix));

          if (hasMention) {
            this.playMentionSound();
            this.canvasService.addNotification('Has sido mencionado en el chat', 'info');
          } else if (msg.isPrivate) {
            // Notificación suave para mensajes privados
            this.playMentionSound();
            const senderName = msg.sender.displayName || msg.sender.email?.split('@')[0] || 'Alguien';
            this.canvasService.addNotification(`Mensaje privado de ${senderName}`, 'info');
          }
        }
      }
    };


    this.canvasService.connect(this.boardId, token);

    this.canvasService.loadElements(this.boardId).subscribe((elements: BoardElement[]) => {
      this.canvasService.elements.set(elements || []);
      this.isLoading = false;
      if (this.loadingRef) {
        this.loadingRef.startFadeOut();
      } else {
        this.showLoading = false;
      }
    });

    this.cursorSubject.pipe(debounceTime(30)).subscribe((pos: { x: number, y: number }) => {
      this.canvasService.emitCursorMove(this.boardId, pos.x, pos.y);
    });

    this.saveSubject.pipe(debounceTime(2000)).subscribe((elements: BoardElement[]) => {
      this.isSaving = true;
      this.canvasService.saveElements(this.boardId, elements).subscribe({
        next: () => this.isSaving = false,
        error: () => this.isSaving = false,
      });
    });
  }

  ngOnDestroy() {
    this.canvasService.onKicked = null;
    this.canvasService.onChatMessageReceived = null;
    this.canvasService.disconnect();
    // Cleanup capture session when leaving the board
    this.tasksService.stopCapture();
    if (this.breakInterval) {
      clearInterval(this.breakInterval);
      this.breakInterval = null;
    }
  }

  // ─── Expulsión de usuarios ────────────────────────────────────────────────

  async kickUser(targetUserId: string, targetName: string) {
    if (!this.isHost) return;
    if (!confirm(`¿Expulsar a ${targetName} de la pizarra?`)) return;

    this.kickingUserId = targetUserId;
    const result = await this.canvasService.kickUser(this.boardId, targetUserId);
    this.kickingUserId = null;

    if (result.success) {
      this.canvasService.addNotification(`${targetName} fue expulsado`, 'warning');
    } else {
      this.canvasService.addNotification(`Error: ${result.message}`, 'error');
    }
  }

  // ─── Helpers de UI ────────────────────────────────────────────────────────

  get currentUserId(): string {
    return this.authService.currentUser()?.sub ?? '';
  }

  toggleUsersPanel() {
    this.showUsersPanel = !this.showUsersPanel;
    if (this.showUsersPanel && this.activeTab === 'chat') {
      this.unreadMessagesCount = 0;
      this.scrollToBottom();
    }
    // Cerrar otros paneles al abrir el de usuarios
    if (this.showUsersPanel) {
      this.showHistoryPanel = false;
    }
  }

  selectTab(tab: 'users' | 'chat' | 'dms') {
    this.activeTab = tab;
    if (tab === 'chat') {
      this.unreadMessagesCount = 0;
      this.scrollToBottom();
    }
    if (tab === 'dms') {
      this.unreadDmCount = 0;
      this.dmActiveContactId = null;
    }
    this.showSuggestions = false;
  }

  sendMessage() {
    if (!this.newMessageText || !this.newMessageText.trim()) return;

    let text = this.newMessageText.trim();
    let recipientId = this.chatRecipientId;
    let isPrivate = recipientId !== '';

    // Detectar comandos privados como /w @usuario mensaje
    const whisperMatch = text.match(/^\/(w|msg|pm)\s+@([^\s]+)\s+(.+)$/i);
    if (whisperMatch) {
      const targetUsername = whisperMatch[2].toLowerCase();
      const actualMsg = whisperMatch[3];

      const foundUser = this.canvasService.connectedUsers().find(u => 
        (u.displayName && u.displayName.toLowerCase().replace(/\s+/g, '') === targetUsername) ||
        u.email.split('@')[0].toLowerCase() === targetUsername
      );
      if (foundUser) {
        recipientId = foundUser.userId;
        isPrivate = true;
        text = actualMsg;
      }
    }

    this.canvasService.sendChatMessage(this.boardId, text, recipientId, isPrivate);
    this.newMessageText = '';
    this.scrollToBottom();
  }

  playMentionSound() {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      playTone(880, now, 0.3);
      playTone(1318.51, now + 0.1, 0.4);
    } catch (e) {
      console.warn('No se pudo jugar el sonido de mención:', e);
    }
  }

  isMessageMentioningMe(msg: ChatMessage): boolean {
    if (msg.sender._id === this.currentUserId) return false;
    const currentUser = this.authService.currentUser();
    if (!currentUser) return false;
    const myName = (currentUser.displayName || '').toLowerCase().replace(/\s+/g, '');
    const myEmailPrefix = (currentUser.email || '').split('@')[0].toLowerCase();
    const cleanMessage = msg.message.toLowerCase();
    return (!!myName && cleanMessage.includes('@' + myName)) ||
           (!!myEmailPrefix && cleanMessage.includes('@' + myEmailPrefix));
  }

  getRecipientName(msg: ChatMessage): string {
    if (!msg.recipient) return '';
    return msg.recipient.displayName || (msg.recipient.email ? msg.recipient.email.split('@')[0] : '');
  }

  endBreakTime() {
    if (!this.isHost) return;
    this.canvasService.sendChatMessage(this.boardId, '/break time stop');
  }

  scrollToBottom() {
    setTimeout(() => {
      if (this.chatMessagesContainer) {
        const element = this.chatMessagesContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    }, 50);
  }

  getMemberColor(userId: string): string {
    const user = this.canvasService.connectedUsers().find(u => u.userId === userId);
    return user?.cursorColor || '#4F46E5';
  }

  // ─── Autocompletado del Chat ───────────────────────────────────────────────

  onChatInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.chatInputRef = input;
    const val = input.value;
    const cursorPos = input.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursorPos);

    // Detectar '/' al inicio del texto
    if (val.startsWith('/') && !val.includes(' ')) {
      const query = val.slice(1).toLowerCase();
      const filteredCmds = this.CHAT_COMMANDS.filter(c =>
        (!c.hostOnly || this.isHost) &&
        c.label.toLowerCase().slice(1).startsWith(query)
      );
      if (filteredCmds.length > 0) {
        this.suggestionType = 'command';
        this.suggestions = filteredCmds;
        this.selectedSuggestionIndex = 0;
        this.showSuggestions = true;
        return;
      }
    }

    // Detectar '@' en cualquier posición del texto
    const atMatch = textBefore.match(/@([\w]*)$/);
    if (atMatch) {
      const query = atMatch[1].toLowerCase();
      const users = this.canvasService.connectedUsers().filter(u =>
        u.userId !== this.currentUserId &&
        ((u.displayName || '').toLowerCase().includes(query) ||
         u.email.split('@')[0].toLowerCase().includes(query))
      );
      this.suggestionType = 'mention';
      this.suggestions = users;
      this.selectedSuggestionIndex = 0;
      this.showSuggestions = users.length > 0;
      return;
    }

    // Si no hay nada que autocomplete
    this.showSuggestions = false;
    this.suggestionType = null;
  }

  onChatKeyDown(event: KeyboardEvent) {
    if (!this.showSuggestions) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectedSuggestionIndex = (this.selectedSuggestionIndex + 1) % this.suggestions.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedSuggestionIndex = (this.selectedSuggestionIndex - 1 + this.suggestions.length) % this.suggestions.length;
    } else if (event.key === 'Tab' || event.key === 'Enter') {
      if (this.suggestions.length > 0) {
        event.preventDefault();
        this.selectSuggestion(this.suggestions[this.selectedSuggestionIndex]);
      }
    } else if (event.key === 'Escape') {
      this.showSuggestions = false;
    }
  }

  selectSuggestion(suggestion: any) {
    if (this.suggestionType === 'command') {
      this.newMessageText = suggestion.prefix;
    } else if (this.suggestionType === 'mention') {
      const name = (suggestion.displayName || suggestion.email.split('@')[0]).replace(/\s+/g, '');
      // Reemplazar el '@query' actual con '@nombre '
      this.newMessageText = this.newMessageText.replace(/@[\w]*$/, '@' + name + ' ');
    }
    this.showSuggestions = false;
    this.suggestionType = null;
    // Enfocar el input nuevamente
    setTimeout(() => {
      if (this.chatInputRef) this.chatInputRef.focus();
    }, 0);
  }

  /** Renderiza el texto del mensaje resaltando @menciones en dorado */
  formatMessageText(text: string): string {
    return text.replace(/@([\w]+)/g, '<span class="mention-tag">@$1</span>');
  }

  // ─── Panel DMs ──────────────────────────────────────────────────────────────

  /** Obtiene la lista de contactos con quienes hay DMs, con último mensaje */
  getDmConversations(): { userId: string; displayName: string; email: string; color: string; lastMsg: ChatMessage }[] {
    const msgs = this.canvasService.chatMessages().filter(m => m.isPrivate);
    const contactMap = new Map<string, any>();

    for (const msg of msgs) {
      const isSender = msg.sender._id === this.currentUserId;
      const contactId = isSender ? msg.recipient?._id : msg.sender._id;
      const contactName = isSender
        ? (msg.recipient?.displayName || msg.recipient?.email?.split('@')[0] || '')
        : (msg.sender.displayName || msg.sender.email?.split('@')[0] || '');
      const contactEmail = isSender ? (msg.recipient?.email || '') : (msg.sender.email || '');

      if (contactId && !contactMap.has(contactId)) {
        contactMap.set(contactId, {
          userId: contactId,
          displayName: contactName,
          email: contactEmail,
          color: this.getMemberColor(contactId),
          lastMsg: msg,
        });
      } else if (contactId) {
        contactMap.get(contactId)!.lastMsg = msg;
      }
    }
    return Array.from(contactMap.values());
  }

  /** Obtiene los mensajes DM de un contacto específico */
  getDmMessages(contactId: string): ChatMessage[] {
    return this.canvasService.chatMessages().filter(m =>
      m.isPrivate &&
      ((m.sender._id === this.currentUserId && m.recipient?._id === contactId) ||
       (m.sender._id === contactId && m.recipient?._id === this.currentUserId))
    );
  }

  openDmContact(userId: string) {
    this.dmActiveContactId = userId;
    // Iniciar DM preseleccionando el contacto en el selector
    this.chatRecipientId = userId;
  }

  backToDmList() {
    this.dmActiveContactId = null;
    this.chatRecipientId = '';
  }

  // ─── Historial de imágenes ───────────────────────────────────────────────

  openHistoryPanel() {
    this.showImageDropdown = false;
    this.showHistoryPanel = true;
    this.showUsersPanel = false;
    this.loadImageHistory();
  }

  closeHistoryPanel() {
    this.showHistoryPanel = false;
  }

  loadImageHistory() {
    this.isLoadingHistory = true;
    this.canvasService.getImageHistory(this.boardId).subscribe({
      next: (res: ImageHistoryResult) => {
        this.personalImages = res.personal || [];
        this.boardImages = res.board || [];
        this.isLoadingHistory = false;
      },
      error: () => {
        this.isLoadingHistory = false;
      }
    });
  }

  insertImageFromHistory(img: ImageHistoryItem) {
    if (this.canvasService.breakState()) return;
    const user = this.authService.currentUser();
    const MAX_W = 400;
    const MAX_H = 300;
    const ratio = Math.min(MAX_W / img.width, MAX_H / img.height, 1);
    const displayW = Math.round(img.width * ratio);
    const displayH = Math.round(img.height * ratio);

    const newImage: BoardElement = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'image',
      content: img.publicId,
      x: (window.innerWidth / 2 - this.panX) / this.zoom - displayW / 2,
      y: (window.innerHeight / 2 - this.panY) / this.zoom - displayH / 2,
      color: 'transparent',
      createdBy: user?.sub!,
      imageUrl: img.url,
      width: displayW,
      height: displayH,
    };

    const updated = [...this.canvasService.elements(), newImage];
    this.canvasService.emitCanvasUpdate(this.boardId, updated);
    this.saveSubject.next(updated);
    this.canvasService.addNotification('Imagen insertada desde el historial', 'success');

    if (this.tasksService.isCapturing() && this.tasksService.capturingTaskId()) {
      this.tasksService.addElementToTask(this.tasksService.capturingTaskId()!, newImage.id);
    }
  }

  // ─── Oyentes de eventos físicos ───────────────────────────────────────────────

  // ─── Menú contextual (click derecho) ───────────────────────────────────────

  @HostListener('contextmenu', ['$event'])
  onContextMenu(e: MouseEvent) {
    const target = e.target as HTMLElement;
    // Solo abrir en el lienzo (canvas-wrapper o canvas-layer), no en elementos
    if (!target.classList.contains('canvas-wrapper') && !target.classList.contains('canvas-layer')) return;
    e.preventDefault();
    this.contextMenuX = e.clientX;
    this.contextMenuY = e.clientY;
    // Calcular coordenadas en el espacio canvas
    this.contextMenuCanvasX = (e.clientX - this.panX) / this.zoom;
    this.contextMenuCanvasY = (e.clientY - this.panY) / this.zoom;
    this.showContextMenu = true;
    this.showImageDropdown = false;
  }

  @HostListener('click')
  onGlobalClick() {
    this.showContextMenu = false;
    this.showImageDropdown = false;
  }

  closeContextMenu() {
    this.showContextMenu = false;
  }

  contextAddNote() {
    this.closeContextMenu();
    this.addNote(this.contextMenuCanvasX - 125, this.contextMenuCanvasY - 80);
  }

  contextAddShape(shape: 'square' | 'circle' | 'triangle' | 'arrow' | 'line') {
    this.closeContextMenu();
    this.addShape(shape, this.contextMenuCanvasX - 50, this.contextMenuCanvasY - 50);
  }

  contextUploadImage() {
    this.closeContextMenu();
    this.triggerImageUpload();
  }

  contextOpenHistory() {
    this.closeContextMenu();
    this.openHistoryPanel();
  }

  startPan(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.classList.contains('canvas-wrapper') || target.classList.contains('canvas-layer')) {
      this.isPanning = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.selectedElementId = null;
      this.activeSubmenu = null;
    }
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(e: MouseEvent) {
    this.mouseScreenX = e.clientX;
    this.mouseScreenY = e.clientY;

    if (this.isDraggingTaskBubble) {
      const dx = e.clientX - this.dragBubbleStartX;
      const dy = e.clientY - this.dragBubbleStartY;
      this.taskBubbleX += dx;
      this.taskBubbleY += dy;
      this.dragBubbleStartX = e.clientX;
      this.dragBubbleStartY = e.clientY;
      return;
    }

    this.cursorSubject.next({ x: (e.clientX - this.panX) / this.zoom, y: (e.clientY - this.panY) / this.zoom });

    if (this.isPanning) {
      this.panX += e.clientX - this.lastPanX;
      this.panY += e.clientY - this.lastPanY;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      return;
    }

    if (this.isRotatingId) {
      const current = this.canvasService.elements();
      const updated = current.map(el => {
        if (el.id === this.isRotatingId) {
          const w = el.type === 'note' ? 250 : (el.width || 100);
          const h = el.type === 'note' ? (el.minimized ? 28 : 152) : (el.height || 100);
          const centerX = el.x + w / 2;
          const centerY = el.y + h / 2;
          const mouseX = (e.clientX - this.panX) / this.zoom;
          const mouseY = (e.clientY - this.panY) / this.zoom;
          // 90 - atan2: el handle vive en la dirección (sin, cos) del eje local "abajo".
          // atan2(dy, dx) devuelve 90° cuando el ratón está justo debajo del centro,
          // por eso 90 - atan2 mapea correctamente: abajo→0°, derecha→90°, arriba→180°, izq→270°.
          const angle = 90 - Math.atan2(mouseY - centerY, mouseX - centerX) * (180 / Math.PI);
          return { ...el, rotation: angle };
        }
        return el;
      });
      this.canvasService.elements.set(updated);
      return;
    }

    if (this.resizingId) {
      const dx = (e.clientX - this.lastPanX) / this.zoom;
      const dy = (e.clientY - this.lastPanY) / this.zoom;
      const current = this.canvasService.elements();
      const updated = current.map(el => {
        if (el.id === this.resizingId) {
          return {
            ...el,
            width: Math.max(20, this.resizeStartW + dx),
            height: Math.max(20, this.resizeStartH + dy)
          };
        }
        return el;
      });
      this.canvasService.elements.set(updated);
      return;
    }

    if (this.draggingId) {
      const current = this.canvasService.elements();
      const updated = current.map(el => {
        if (el.id === this.draggingId) {
          return {
            ...el,
            x: ((e.clientX - this.panX) / this.zoom) - this.dragOffsetX,
            y: ((e.clientY - this.panY) / this.zoom) - this.dragOffsetY
          };
        }
        return el;
      });
      this.canvasService.emitCanvasUpdate(this.boardId, updated);
    }
  }

  @HostListener('mouseup')
  onMouseUp() {
    this.isPanning = false;
    this.isDraggingMinimap = false;
    this.isDraggingTaskBubble = false;

    if (this.resizingId) {
      this.canvasService.emitCanvasUpdate(this.boardId, this.canvasService.elements());
      this.saveSubject.next(this.canvasService.elements());
      this.resizingId = null;
    }

    if (this.isRotatingId) {
      this.canvasService.emitCanvasUpdate(this.boardId, this.canvasService.elements());
      this.saveSubject.next(this.canvasService.elements());
      this.isRotatingId = null;
    }

    if (this.draggingId) {
      this.draggingId = null;
      this.saveSubject.next(this.canvasService.elements());
    }
  }

  // ─── Motor de elementos ───────────────────────────────────────────────────

  addNote(canvasX?: number, canvasY?: number) {
    if (this.canvasService.breakState()) return;
    const user = this.authService.currentUser();
    const x = canvasX !== undefined ? canvasX : (window.innerWidth / 2 - this.panX) / this.zoom - 125;
    const y = canvasY !== undefined ? canvasY : (window.innerHeight / 2 - this.panY) / this.zoom - 80;
    const newNote: BoardElement = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'note',
      content: 'Ingresa texto estratégico...',
      x,
      y,
      color: '#121215',
      createdBy: user?.sub!
    };

    const updated = [...this.canvasService.elements(), newNote];
    this.canvasService.emitCanvasUpdate(this.boardId, updated);
    this.saveSubject.next(updated);

    if (this.tasksService.isCapturing() && this.tasksService.capturingTaskId()) {
      this.tasksService.addElementToTask(this.tasksService.capturingTaskId()!, newNote.id);
    }
  }

  addShape(shape: 'square' | 'circle' | 'triangle' | 'arrow' | 'line', canvasX?: number, canvasY?: number) {
    if (this.canvasService.breakState()) return;
    const user = this.authService.currentUser();
    const x = canvasX !== undefined ? canvasX : (window.innerWidth / 2 - this.panX) / this.zoom - 50;
    const y = canvasY !== undefined ? canvasY : (window.innerHeight / 2 - this.panY) / this.zoom - 50;
    const newShape: BoardElement = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'shape',
      shapeType: shape,
      content: '',
      x,
      y,
      width: 100,
      height: 100,
      color: '#3B82F6',
      createdBy: user?.sub!
    };

    const updated = [...this.canvasService.elements(), newShape];
    this.canvasService.emitCanvasUpdate(this.boardId, updated);
    this.saveSubject.next(updated);

    if (this.tasksService.isCapturing() && this.tasksService.capturingTaskId()) {
      this.tasksService.addElementToTask(this.tasksService.capturingTaskId()!, newShape.id);
    }
  }

  changeColor(id: string, color: string) {
    const updated = this.canvasService.elements().map(n =>
      n.id === id ? { ...n, color } : n
    );
    this.canvasService.emitCanvasUpdate(this.boardId, updated);
    this.saveSubject.next(updated);
  }

  startResize(e: MouseEvent, note: BoardElement) {
    e.stopPropagation();
    this.resizingId = note.id;
    this.resizeStartW = note.width || 100;
    this.resizeStartH = note.height || 100;
    this.lastPanX = e.clientX;
    this.lastPanY = e.clientY;
  }

  startRotate(e: MouseEvent, note: BoardElement) {
    e.stopPropagation();
    this.isRotatingId = note.id;
  }

  // ─── Geometría exacta en viewport ─────────────────────────────────────────

  /**
   * Proyecta los 4 vértices del objeto al espacio de pantalla (viewport)
   * y devuelve sus extremos reales (no AABB del AABB) más el centro.
   */
  getElementViewportGeometry(el: BoardElement): {
    cx: number; cy: number;
    vertices: { x: number; y: number }[];
    top: number; bottom: number; left: number; right: number;
  } {
    const { w, h } = this.getSelectedElementDims(el);
    const rad = ((el.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Centro del objeto en pantalla
    const cx = (el.x + w / 2) * this.zoom + this.panX;
    const cy = (el.y + h / 2) * this.zoom + this.panY;

    // Vértices locales (relativo al centro del objeto en unidades canvas)
    const localCorners = [
      { x: -w / 2, y: -h / 2 },
      { x:  w / 2, y: -h / 2 },
      { x:  w / 2, y:  h / 2 },
      { x: -w / 2, y:  h / 2 },
    ];

    // Proyectar cada vértice al viewport: rotar + escalar por zoom + trasladar al centro pantalla
    const vertices = localCorners.map(p => ({
      x: cx + (p.x * cos - p.y * sin) * this.zoom,
      y: cy + (p.x * sin + p.y * cos) * this.zoom,
    }));

    const xs = vertices.map(v => v.x);
    const ys = vertices.map(v => v.y);

    return {
      cx, cy,
      vertices,
      top:    Math.min(...ys),
      bottom: Math.max(...ys),
      left:   Math.min(...xs),
      right:  Math.max(...xs),
    };
  }

  /**
   * Posición del tirador de rotación en viewport.
   * Siempre se ubica en la parte inferior del bounding box rotado en pantalla.
   */
  getRotateHandleScreenPos(el: BoardElement): { x: number; y: number } | null {
    if (!el) return null;
    const geo = this.getElementViewportGeometry(el);
    const HANDLE_GAP = 28; // píxeles de pantalla entre borde del objeto y el handle

    // El handle siempre se ubica en la parte inferior del bounding box en pantalla
    return {
      x: Math.max(20, Math.min(geo.cx, window.innerWidth  - 20)),
      y: Math.max(20, Math.min(geo.bottom + HANDLE_GAP, window.innerHeight - 20)),
    };
  }

  getDisplayRotation(el: BoardElement): number {
    let r = Math.round(el.rotation || 0) % 360;
    if (r < 0) r += 360;
    return r;
  }

  getDegreeBadgeScreenPos(el: BoardElement): { x: number; y: number } | null {
    if (!el) return null;
    const geo = this.getElementViewportGeometry(el);
    const BADGE_H = 24;
    const BADGE_GAP = 20;

    const x = geo.cx;
    const y = geo.bottom + BADGE_GAP;

    return {
      x: Math.max(40, Math.min(x, window.innerWidth - 40)),
      y: Math.max(60 + BADGE_H, Math.min(y, window.innerHeight - BADGE_H))
    };
  }


  triggerImageUpload() {
    if (this.canvasService.breakState()) return;
    this.uploadError = null;
    this.imageInputRef.nativeElement.value = '';
    this.imageInputRef.nativeElement.click();
  }

  onImageFileSelected(event: Event) {
    if (this.canvasService.breakState()) return;
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      this.uploadError = 'El archivo supera el límite de 8MB.';
      return;
    }

    this.isUploadingImage = true;
    this.uploadError = null;

    this.canvasService.uploadImage(file, this.boardId, false).subscribe({
      next: (res: { url: string; publicId: string; width: number; height: number; message: string }) => {
        const user = this.authService.currentUser();

        const MAX_W = 400;
        const MAX_H = 300;
        const ratio = Math.min(MAX_W / res.width, MAX_H / res.height, 1);
        const displayW = Math.round(res.width * ratio);
        const displayH = Math.round(res.height * ratio);

        const newImage: BoardElement = {
          id: Math.random().toString(36).substr(2, 9),
          type: 'image',
          content: file.name,
          x: Math.max(0, window.innerWidth / 2 - displayW / 2) - this.panX,
          y: Math.max(60, window.innerHeight / 2 - displayH / 2) - this.panY,
          color: 'transparent',
          createdBy: user?.sub!,
          imageUrl: res.url,
          width: displayW,
          height: displayH,
        };

        const updated = [...this.canvasService.elements(), newImage];
        this.canvasService.emitCanvasUpdate(this.boardId, updated);
        this.saveSubject.next(updated);
        this.isUploadingImage = false;

        if (this.tasksService.isCapturing() && this.tasksService.capturingTaskId()) {
          this.tasksService.addElementToTask(this.tasksService.capturingTaskId()!, newImage.id);
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.uploadError = err?.error?.message || 'Error al subir la imagen. Intenta de nuevo.';
        this.isUploadingImage = false;
      }
    });
  }

  startDrag(e: MouseEvent, note: BoardElement) {
    if ((e.target as HTMLElement).tagName.toLowerCase() === 'textarea') return;
    this.draggingId = note.id;
    this.dragOffsetX = ((e.clientX - this.panX) / this.zoom) - note.x;
    this.dragOffsetY = ((e.clientY - this.panY) / this.zoom) - note.y;
    if (this.selectedElementId !== note.id) {
      this.activeSubmenu = null;
    }
    this.selectedElementId = note.id;
    this.showContextMenu = false;
  }

  updateContent(note: BoardElement, newContent: string) {
    const updated = this.canvasService.elements().map(n =>
      n.id === note.id ? { ...n, content: newContent } : n
    );
    this.canvasService.emitCanvasUpdate(this.boardId, updated);
    this.saveSubject.next(updated);
  }

  updateTitle(note: BoardElement, newTitle: string) {
    const updated = this.canvasService.elements().map(n =>
      n.id === note.id ? { ...n, title: newTitle } : n
    );
    this.canvasService.emitCanvasUpdate(this.boardId, updated);
    this.saveSubject.next(updated);
  }

  toggleMinimizeNote(e: MouseEvent, note: BoardElement) {
    e.stopPropagation();
    const updated = this.canvasService.elements().map(n =>
      n.id === note.id ? { ...n, minimized: !n.minimized } : n
    );
    this.canvasService.emitCanvasUpdate(this.boardId, updated);
    this.saveSubject.next(updated);
  }

  deleteNote(id: string) {
    if (this.selectedElementId === id) {
      this.selectedElementId = null;
      this.activeSubmenu = null;
    }
    const updated = this.canvasService.elements().filter(n => n.id !== id);
    this.canvasService.emitCanvasUpdate(this.boardId, updated);
    this.saveSubject.next(updated);
  }

  selectElement(e: MouseEvent, note: BoardElement) {
    e.stopPropagation();
    if (this.selectedElementId !== note.id) {
      this.activeSubmenu = null;
    }
    this.selectedElementId = note.id;
  }

  changeLayer(id: string, layer: number) {
    const updated = this.canvasService.elements().map(el =>
      el.id === id ? { ...el, layer } : el
    );
    this.canvasService.emitCanvasUpdate(this.boardId, updated);
    this.saveSubject.next(updated);
  }

  copyElement(id: string) {
    const element = this.canvasService.elements().find(el => el.id === id);
    if (!element) return;

    const newElement: BoardElement = {
      ...element,
      id: Math.random().toString(36).substr(2, 9),
      x: element.x + 30,
      y: element.y + 30,
      createdBy: this.authService.currentUser()?.sub!
    };

    const updated = [...this.canvasService.elements(), newElement];
    this.canvasService.emitCanvasUpdate(this.boardId, updated);
    this.saveSubject.next(updated);
    this.selectedElementId = newElement.id;

    if (this.tasksService.isCapturing() && this.tasksService.capturingTaskId()) {
      this.tasksService.addElementToTask(this.tasksService.capturingTaskId()!, newElement.id);
    }
    this.activeSubmenu = null;
  }

  deformShape(id: string, axis: 'wider' | 'taller' | 'reset') {
    const updated = this.canvasService.elements().map(el => {
      if (el.id === id) {
        const w = el.width || 100;
        const h = el.height || 100;
        switch (axis) {
          case 'wider': return { ...el, width: w * 1.25, height: h * 0.9 };
          case 'taller': return { ...el, width: w * 0.9, height: h * 1.25 };
          case 'reset': return { ...el, width: 100, height: 100 };
        }
      }
      return el;
    });
    this.canvasService.emitCanvasUpdate(this.boardId, updated);
    this.saveSubject.next(updated);
  }

  rotateShape(id: string) {
    const updated = this.canvasService.elements().map(el => {
      if (el.id === id) {
        return { ...el, rotation: ((el.rotation || 0) + 45) % 360 };
      }
      return el;
    });
    this.canvasService.emitCanvasUpdate(this.boardId, updated);
    this.saveSubject.next(updated);
  }

  toggleSubmenu(menu: 'color' | 'layer' | 'quick') {
    if (this.activeSubmenu === menu) {
      this.activeSubmenu = null;
    } else {
      this.activeSubmenu = menu;
    }
  }

  getSelectedElement(): BoardElement | null {
    if (!this.selectedElementId) return null;
    return this.canvasService.elements().find(el => el.id === this.selectedElementId) || null;
  }

  getSelectedElementDims(el: BoardElement): { w: number, h: number } {
    if (el.type === 'note') {
      return { w: 250, h: el.minimized ? 28 : 152 };
    } else if (el.type === 'image') {
      return { w: el.width || 300, h: (el.height || 200) + 24 };
    } else {
      return { w: el.width || 100, h: el.height || 100 };
    }
  }

  getSelectedElementToolbarScreenPos(): { x: number; y: number } | null {
    const el = this.getSelectedElement();
    if (!el) return null;

    const geo = this.getElementViewportGeometry(el);
    const MENU_H = 40;  // altura aproximada del menú en px
    const MENU_GAP = 60; // 60px sobre el objeto en pantalla

    const menuX = geo.cx;
    const menuY = geo.top - MENU_GAP;

    // Limitar dentro de pantalla (topbar 60px + altura del menú)
    const finalX = Math.max(160, Math.min(menuX, window.innerWidth - 160));
    const finalY = Math.max(60 + MENU_H, Math.min(menuY, window.innerHeight - MENU_H));

    return { x: finalX, y: finalY };
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  trackByNoteId(index: number, note: BoardElement) {
    return note.id;
  }

  @HostListener('wheel', ['$event'])
  onWheel(e: WheelEvent) {
    // Si el panel de usuarios/chat está activo, no hacer zoom
    if (this.showUsersPanel) {
      return;
    }

    if (e.target instanceof HTMLElement && e.target.tagName.toLowerCase() === 'textarea') {
      return;
    }

    e.preventDefault();

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(Math.max(0.1, this.zoom * zoomFactor), 4);

    if (newZoom !== this.zoom) {
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;

      this.showZoomUi();
      this.showMinimapUi();
      this.canvasService.emitCanvasUpdate(this.boardId, this.canvasService.elements());
    }
  }

  showZoomUi() {
    this.isZoomingUiVisible = true;
    clearTimeout(this.zoomTimeout);
    this.zoomTimeout = setTimeout(() => {
      this.isZoomingUiVisible = false;
    }, 1500);
  }

  changeZoom(delta: number) {
    const newZoom = Math.min(Math.max(0.1, this.zoom + delta), 4);
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    this.panX = centerX - (centerX - this.panX) * (newZoom / this.zoom);
    this.panY = centerY - (centerY - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;

    this.showZoomUi();
    this.showMinimapUi();
  }

  // ─── Lógica de Mini-Mapa ──────────────────────────────────────────────────
  
  getMinimapBounds() {
    const elements = this.canvasService.elements() || [];
    
    // Vista actual del viewport
    const viewportX = -this.panX / this.zoom;
    const viewportY = -this.panY / this.zoom;
    const viewportW = window.innerWidth / this.zoom;
    const viewportH = window.innerHeight / this.zoom;

    let minX = viewportX;
    let maxX = viewportX + viewportW;
    let minY = viewportY;
    let maxY = viewportY + viewportH;

    // Expandir límites según los elementos en el canvas
    elements.forEach(el => {
      const w = el.type === 'note' ? 250 : (el.width || 100);
      const h = el.type === 'note' ? (el.minimized ? 28 : 144) : (el.height || 100);
      if (el.x < minX) minX = el.x;
      if (el.x + w > maxX) maxX = el.x + w;
      if (el.y < minY) minY = el.y;
      if (el.y + h > maxY) maxY = el.y + h;
    });

    // Agregar un margen (padding) de 300px
    minX -= 300;
    minY -= 300;
    maxX += 300;
    maxY += 300;

    // Asegurar tamaño mínimo del mundo para evitar división por cero
    const width = maxX - minX;
    const height = maxY - minY;
    const minSize = 2500;
    
    if (width < minSize) {
      const center = (minX + maxX) / 2;
      minX = center - minSize / 2;
      maxX = center + minSize / 2;
    }
    if (height < (minSize * 0.6)) {
      const center = (minY + maxY) / 2;
      minY = center - (minSize * 0.6) / 2;
      maxY = center + (minSize * 0.6) / 2;
    }

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
      viewportX,
      viewportY,
      viewportW,
      viewportH
    };
  }

  getMinimapElements() {
    const bounds = this.getMinimapBounds();
    const elements = this.canvasService.elements() || [];
    
    return elements.map(el => {
      const w = el.type === 'note' ? 250 : (el.width || 100);
      const h = el.type === 'note' ? (el.minimized ? 28 : 144) : (el.height || 100);
      return {
        id: el.id,
        type: el.type,
        shapeType: el.shapeType,
        color: el.color,
        x: ((el.x - bounds.minX) / bounds.width) * this.minimapWidth,
        y: ((el.y - bounds.minY) / bounds.height) * this.minimapHeight,
        w: (w / bounds.width) * this.minimapWidth,
        h: (h / bounds.height) * this.minimapHeight,
        rotation: el.rotation || 0
      };
    });
  }

  getMinimapViewport() {
    const bounds = this.getMinimapBounds();
    return {
      x: ((bounds.viewportX - bounds.minX) / bounds.width) * this.minimapWidth,
      y: ((bounds.viewportY - bounds.minY) / bounds.height) * this.minimapHeight,
      w: (bounds.viewportW / bounds.width) * this.minimapWidth,
      h: (bounds.viewportH / bounds.height) * this.minimapHeight
    };
  }

  onMinimapMouseDown(e: MouseEvent) {
    e.stopPropagation();
    this.isDraggingMinimap = true;
    this.panToMinimapPoint(e);
  }

  onMinimapMouseMove(e: MouseEvent) {
    if (this.isDraggingMinimap) {
      e.stopPropagation();
      this.panToMinimapPoint(e);
    }
  }

  onMinimapMouseUp() {
    this.isDraggingMinimap = false;
  }

  private panToMinimapPoint(e: MouseEvent) {
    const minimapElement = document.querySelector('.minimap-container');
    if (!minimapElement) return;

    const rect = minimapElement.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const percentX = Math.min(Math.max(0, clickX / this.minimapWidth), 1);
    const percentY = Math.min(Math.max(0, clickY / this.minimapHeight), 1);

    const bounds = this.getMinimapBounds();
    const worldX = bounds.minX + percentX * bounds.width;
    const worldY = bounds.minY + percentY * bounds.height;

    // Centrar la cámara en la coordenada seleccionada
    this.panX = window.innerWidth / 2 - worldX * this.zoom;
    this.panY = window.innerHeight / 2 - worldY * this.zoom;
  }

  // ─── Tareas de la pizarra ───

  isElementInTask(elementId: string): boolean {
    return this.tasksService.boardTasks().some(
      t => t.elementIds.includes(elementId) && t.status === 'active'
    );
  }

  getElementTaskInfo(elementId: string): Task | null {
    return this.tasksService.boardTasks().find(
      t => t.elementIds.includes(elementId)
    ) || null;
  }

  async loadBoardMembers() {
    try {
      const response = await firstValueFrom(
        this.http.get<any[]>(`${environment.apiUrl}/members/board/${this.boardId}`)
      );
      this.boardMembers.set(response || []);
    } catch (error) {
      console.error('Error loading board members:', error);
    }
  }

  startDragTaskBubble(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    this.isDraggingTaskBubble = true;
    this.dragBubbleStartX = e.clientX;
    this.dragBubbleStartY = e.clientY;
  }

  openNewTaskModal() {
    this.showNewTaskModal = true;
    this.newTaskTitle = '';
    this.newTaskDescription = '';
    // Select first member by default if available
    const members = this.boardMembers();
    if (members.length > 0) {
      this.newTaskAssignedTo = members[0].userId._id;
    } else {
      this.newTaskAssignedTo = '';
    }
  }

  closeNewTaskModal() {
    this.showNewTaskModal = false;
  }

  async createNewTask() {
    if (!this.newTaskTitle.trim() || !this.newTaskAssignedTo) {
      this.canvasService.addNotification('Por favor, completa el título y asignado.', 'warning');
      return;
    }
    try {
      await this.tasksService.createTask(
        this.boardId,
        this.newTaskTitle.trim(),
        this.newTaskDescription.trim(),
        this.newTaskAssignedTo
      );
      this.canvasService.addNotification('Tarea asignada exitosamente.', 'success');
      this.closeNewTaskModal();
    } catch (error) {
      this.canvasService.addNotification('Error al crear la tarea.', 'error');
    }
  }

  async completeTask(taskId: string) {
    try {
      await this.tasksService.completeTask(taskId);
      this.canvasService.addNotification('Tarea completada.', 'success');
    } catch (error) {
      this.canvasService.addNotification('Error al completar la tarea.', 'error');
    }
  }

  toggleCapture(taskId: string) {
    if (this.tasksService.isCapturing() && this.tasksService.capturingTaskId() === taskId) {
      this.tasksService.stopCapture();
      this.canvasService.addNotification('Captura de objetos finalizada.', 'info');
    } else {
      this.tasksService.startCapture(taskId);
      this.canvasService.addNotification('Captura de objetos iniciada. Todos los nuevos objetos se marcarán con esta tarea.', 'success');
    }
  }
}