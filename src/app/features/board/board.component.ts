import { Component, OnInit, OnDestroy, HostListener, inject } from '@angular/core';
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
  hasRoleAccess = true;

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
        error: () => {
          this.isSaving = false;
          // Si el Backend responde error de rol, el Canvas Controller bloquea
        }
      });
    });
  }

  ngOnDestroy() {
    this.canvasService.disconnect();
  }

  // --- OYENTES DE EVENTOS FÍSICOS WINDOWS/MAC ---
  @HostListener('mousemove', ['$event'])
  onMouseMove(e: MouseEvent) {
    this.cursorSubject.next({ x: e.clientX, y: e.clientY }); // Notificar ubicación constantemente

    if (this.draggingId) {
      const current = this.canvasService.elements();
      const updated = current.map(el => {
        if (el.id === this.draggingId) {
          return { ...el, x: e.clientX - this.dragOffsetX, y: e.clientY - this.dragOffsetY };
        }
        return el;
      });
      // El cambio de posición del post-it viaja por Socket Inmediatamente a los demás miembros
      this.canvasService.emitCanvasUpdate(this.boardId, updated);
    }
  }

  @HostListener('mouseup')
  onMouseUp() {
    if (this.draggingId) {
      this.draggingId = null;
      // Inicia el contador de MongoDB de 2 segundos para guardarlo
      this.saveSubject.next(this.canvasService.elements());
    }
  }

  // --- MOTOR PREDICITVO DOM ---
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

  startDrag(e: MouseEvent, note: BoardElement) {
    // Evitar arrastrar si da clic literal en las letras para editar
    if ((e.target as HTMLElement).tagName.toLowerCase() === 'textarea') return; 
    
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
}
