import { Component, OnInit, OnDestroy, HostListener, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CanvasService, BoardElement } from '../../core/canvas/canvas.service';
import { AuthService } from '../../core/auth/auth.service';
import { BoardsService } from '../../core/boards/boards.service';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './board.component.html',
})
export class BoardComponent implements OnInit, OnDestroy {
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
  
  boardName: string = 'Cargando...';
  boardRole: string = 'Conectando...';

  // Referencia al input oculto de archivos para activarlo con el botón
  @ViewChild('imageInput') imageInputRef!: ElementRef<HTMLInputElement>;

  // RxJS Subjects para optimización extrema y prevenir saturación
  private cursorSubject = new Subject<{x: number, y: number}>();
  private saveSubject = new Subject<BoardElement[]>();

  draggingId: string | null = null;
  dragOffsetX = 0;
  dragOffsetY = 0;
  resizingId: string | null = null;
  resizeStartW = 0;
  resizeStartH = 0;
  isRotatingId: string | null = null;

  // --- Pan & Zoom / Infinite Canvas ---
  isPanning = false;
  panX = 0;
  panY = 0;
  lastPanX = 0;
  lastPanY = 0;
  zoom = 1;

  isZoomingUiVisible = false;
  private zoomTimeout: any;

  ngOnInit() {
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
        this.boardRole = currentBoard.myRole === 'host' ? 'Host' : 
                         currentBoard.myRole === 'member' ? 'Member' : 'Reader';
      }
    });

    // Levantar túnel de conexión en tiempo real
    this.canvasService.connect(this.boardId, token);

    // Cargar datos estáticos iniciales desde la Base de Datos
    this.canvasService.loadElements(this.boardId).subscribe((elements: BoardElement[]) => {
      this.canvasService.elements.set(elements || []);
    });

    // Filtros de Tasa (FPS Control) para el Mouse Local -> WSS
    this.cursorSubject.pipe(debounceTime(30)).subscribe((pos: {x: number, y: number}) => {
      this.canvasService.emitCursorMove(this.boardId, pos.x, pos.y);
    });

    // Petición a REST MongoDB ejecutada "silenciosamente" tras 2 segundos de inactividad de dibujo
    this.saveSubject.pipe(debounceTime(2000)).subscribe((elements: BoardElement[]) => {
      this.isSaving = true;
      this.canvasService.saveElements(this.boardId, elements).subscribe({
        next: () => this.isSaving = false,
        error: () => this.isSaving = false,
      });
    });
  }

  ngOnDestroy() {
    this.canvasService.disconnect();
  }

  // --- OYENTES DE EVENTOS FÍSICOS WINDOWS/MAC ---
  startPan(e: MouseEvent) {
    const target = e.target as HTMLElement;
    // Iniciamos pan si hacemos clic en el wrapper del canvas (fondo)
    if (target.classList.contains('canvas-wrapper') || target.classList.contains('canvas-layer')) {
      this.isPanning = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
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
          angle = angle + 90; // offset so dragging from top handle is 0 rotation
          return { ...el, rotation: angle };
        }
        return el;
      });
      this.canvasService.elements.set(updated);
      this.cursorSubject.next({ x: (e.clientX - this.panX) / this.zoom, y: (e.clientY - this.panY) / this.zoom });
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
      // We only emit locally rapidly to not saturate, saveSubject handles DB
      this.canvasService.elements.set(updated);
      this.cursorSubject.next({ x: (e.clientX - this.panX) / this.zoom, y: (e.clientY - this.panY) / this.zoom }); // prevent stutter
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

  // --- MOTOR DE ELEMENTOS ---
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
      color: '#3B82F6', // Color default (ej. neonBlue-ish)
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
    e.stopPropagation(); // Evitar arrastrar el elemento principal
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

  // Abre el selector de archivos nativo del sistema operativo
  triggerImageUpload() {
    this.uploadError = null;
    this.imageInputRef.nativeElement.value = ''; // Resetear para permitir subir el mismo archivo de nuevo
    this.imageInputRef.nativeElement.click();
  }

  // Recibe el archivo seleccionado, lo sube a Cloudinary y crea el elemento en el canvas
  onImageFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    // Validación de tamaño en el cliente antes de siquiera intentar subir
    if (file.size > 8 * 1024 * 1024) {
      this.uploadError = 'El archivo supera el límite de 8MB.';
      return;
    }

    this.isUploadingImage = true;
    this.uploadError = null;

    this.canvasService.uploadImage(file).subscribe({
      next: (res: { url: string; publicId: string; width: number; height: number; message: string }) => {
        const user = this.authService.currentUser();

        // Calcular dimensiones: mantener proporción pero con límite máximo de 400x300
        const MAX_W = 400;
        const MAX_H = 300;
        const ratio = Math.min(MAX_W / res.width, MAX_H / res.height, 1);
        const displayW = Math.round(res.width * ratio);
        const displayH = Math.round(res.height * ratio);

        const newImage: BoardElement = {
          id: Math.random().toString(36).substr(2, 9),
          type: 'image',
          content: file.name, // Nombre del archivo como label accesible
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
    // Evitar arrastrar si da clic en la textarea (notas) o en la imagen directamente
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
    const updated = this.canvasService.elements().filter(n => n.id !== id);
    this.canvasService.emitCanvasUpdate(this.boardId, updated);
    this.saveSubject.next(updated);
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  // Prevención de re-renderizado destructivo de Angular
  trackByNoteId(index: number, note: BoardElement) {
    return note.id;
  }

  // Zoom Implementación
  @HostListener('wheel', ['$event'])
  onWheel(e: WheelEvent) {
    // Solo aplicar zoom si no estamos haciendo scroll dentro de una nota
    if (e.target instanceof HTMLElement && e.target.tagName.toLowerCase() === 'textarea') {
      return; 
    }
    
    e.preventDefault(); 
    
    // Zoom in (acercar) o Zoom out (alejar)
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
