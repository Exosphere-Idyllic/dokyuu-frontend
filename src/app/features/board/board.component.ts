import { Component, OnInit, OnDestroy, HostListener, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CanvasService, BoardElement } from '../../core/canvas/canvas.service';
import { AuthService } from '../../core/auth/auth.service';
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
  route = inject(ActivatedRoute);
  router = inject(Router);

  boardId!: string;
  isSaving = false;
  isUploadingImage = false;
  uploadError: string | null = null;
  hasRoleAccess = true;

  // Referencia al input oculto de archivos para activarlo con el botón
  @ViewChild('imageInput') imageInputRef!: ElementRef<HTMLInputElement>;

  // RxJS Subjects para optimización extrema y prevenir saturación
  private cursorSubject = new Subject<{x: number, y: number}>();
  private saveSubject = new Subject<BoardElement[]>();

  draggingId: string | null = null;
  dragOffsetX = 0;
  dragOffsetY = 0;

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
  @HostListener('mousemove', ['$event'])
  onMouseMove(e: MouseEvent) {
    this.cursorSubject.next({ x: e.clientX, y: e.clientY });

    if (this.draggingId) {
      const current = this.canvasService.elements();
      const updated = current.map(el => {
        if (el.id === this.draggingId) {
          return { ...el, x: e.clientX - this.dragOffsetX, y: e.clientY - this.dragOffsetY };
        }
        return el;
      });
      this.canvasService.emitCanvasUpdate(this.boardId, updated);
    }
  }

  @HostListener('mouseup')
  onMouseUp() {
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
      x: window.innerWidth / 2 - 125,
      y: window.innerHeight / 2 - 80,
      color: '#121215',
      createdBy: user?.sub!
    };

    const updated = [...this.canvasService.elements(), newNote];
    this.canvasService.emitCanvasUpdate(this.boardId, updated);
    this.saveSubject.next(updated);
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
          x: Math.max(0, window.innerWidth / 2 - displayW / 2),
          y: Math.max(60, window.innerHeight / 2 - displayH / 2),
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
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'button') return;

    this.draggingId = note.id;
    this.dragOffsetX = e.clientX - note.x;
    this.dragOffsetY = e.clientY - note.y;
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
}
