import { Component, OnInit, OnDestroy, HostListener, inject, ViewChild, ElementRef } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CanvasService, BoardElement } from '../../core/canvas/canvas.service';
import { AuthService } from '../../core/auth/auth.service';
import { BoardsService } from '../../core/boards/boards.service';
import { LoadingComponent } from '../loading/loading.component';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingComponent],
  templateUrl: './board.component.html',
})
export class BoardComponent implements OnInit, OnDestroy {
  private titleService = inject(Title);
  canvasService = inject(CanvasService);
  authService = inject(AuthService);
  boardsService = inject(BoardsService);
  route = inject(ActivatedRoute);
  router = inject(Router);

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

  // Panel de usuarios conectados
  showUsersPanel = false;
  kickingUserId: string | null = null; // ID del usuario siendo expulsado (para loading state)

  @ViewChild('imageInput') imageInputRef!: ElementRef<HTMLInputElement>;

  private cursorSubject = new Subject<{ x: number, y: number }>();
  private saveSubject = new Subject<BoardElement[]>();

  draggingId: string | null = null;
  dragOffsetX = 0;
  dragOffsetY = 0;
  resizingId: string | null = null;
  resizeStartW = 0;
  resizeStartH = 0;
  isRotatingId: string | null = null;

  selectedShapeId: string | null = null;

  isPanning = false;
  panX = 0;
  panY = 0;
  lastPanX = 0;
  lastPanY = 0;
  zoom = 1;

  isZoomingUiVisible = false;
  private zoomTimeout: any;

  ngOnInit() {
    this.boardsService.getBoards().subscribe((boards: any[]) => {
      const currentBoard = boards.find(b => b._id === this.boardId);
      if (currentBoard) {
        this.boardName = currentBoard.name;
        this.isHost = currentBoard.myRole === 'host';
        this.boardRole = this.isHost ? 'Host' :
          currentBoard.myRole === 'member' ? 'Member' : 'Reader';
        this.titleService.setTitle(`Dokyuu — ${currentBoard.name}`); // ← añadir esta línea
      }
    });
    this.boardId = this.route.snapshot.paramMap.get('id')!;
    if (!this.boardId) {
      this.router.navigate(['/dashboard']);
      return;
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
      }
    });

    // Registrar callback de expulsión ANTES de conectar
    this.canvasService.onKicked = (data) => {
      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 2000); // Dar tiempo para que el usuario vea la notificación
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
    this.canvasService.disconnect();
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
  }

  // ─── Oyentes de eventos físicos ───────────────────────────────────────────

  startPan(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.classList.contains('canvas-wrapper') || target.classList.contains('canvas-layer')) {
      this.isPanning = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.selectedShapeId = null;
    }
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(e: MouseEvent) {
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
          const h = el.type === 'note' ? 144 : (el.height || 100);
          const centerX = el.x + w / 2;
          const centerY = el.y + h / 2;
          const mouseX = (e.clientX - this.panX) / this.zoom;
          const mouseY = (e.clientY - this.panY) / this.zoom;
          let angle = Math.atan2(mouseY - centerY, mouseX - centerX) * (180 / Math.PI);
          angle = angle + 90;
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

  addNote() {
    const user = this.authService.currentUser();
    const newNote: BoardElement = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'note',
      content: 'Ingresa texto estratégico...',
      x: (window.innerWidth / 2 - this.panX) / this.zoom - 125,
      y: (window.innerHeight / 2 - this.panY) / this.zoom - 80,
      color: '#121215',
      createdBy: user?.sub!
    };

    const updated = [...this.canvasService.elements(), newNote];
    this.canvasService.emitCanvasUpdate(this.boardId, updated);
    this.saveSubject.next(updated);
  }

  addShape(shape: 'square' | 'circle' | 'triangle' | 'arrow' | 'line') {
    const user = this.authService.currentUser();
    const newShape: BoardElement = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'shape',
      shapeType: shape,
      content: '',
      x: (window.innerWidth / 2 - this.panX) / this.zoom - 50,
      y: (window.innerHeight / 2 - this.panY) / this.zoom - 50,
      width: 100,
      height: 100,
      color: '#3B82F6',
      createdBy: user?.sub!
    };

    const updated = [...this.canvasService.elements(), newShape];
    this.canvasService.emitCanvasUpdate(this.boardId, updated);
    this.saveSubject.next(updated);
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

  triggerImageUpload() {
    this.uploadError = null;
    this.imageInputRef.nativeElement.value = '';
    this.imageInputRef.nativeElement.click();
  }

  onImageFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      this.uploadError = 'El archivo supera el límite de 8MB.';
      return;
    }

    this.isUploadingImage = true;
    this.uploadError = null;

    this.canvasService.uploadImage(file).subscribe({
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
  }

  updateContent(note: BoardElement, newContent: string) {
    const updated = this.canvasService.elements().map(n =>
      n.id === note.id ? { ...n, content: newContent } : n
    );
    this.canvasService.emitCanvasUpdate(this.boardId, updated);
    this.saveSubject.next(updated);
  }

  deleteNote(id: string) {
    if (this.selectedShapeId === id) this.selectedShapeId = null;
    const updated = this.canvasService.elements().filter(n => n.id !== id);
    this.canvasService.emitCanvasUpdate(this.boardId, updated);
    this.saveSubject.next(updated);
  }

  selectShape(e: MouseEvent, note: BoardElement) {
    e.stopPropagation();
    this.selectedShapeId = note.id;
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

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  trackByNoteId(index: number, note: BoardElement) {
    return note.id;
  }

  @HostListener('wheel', ['$event'])
  onWheel(e: WheelEvent) {
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
  }
}