import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';

export interface BoardElement {
  id: string;
  type: 'note' | 'image' | 'shape';
  content: string;
  x: number;
  y: number;
  color: string;
  createdBy: string;
  imageUrl?: string;   // URL de Cloudinary — presente solo si type === 'image'
  width?: number;      // Ancho en px del elemento 
  height?: number;     // Alto en px del elemento
  shapeType?: 'square' | 'circle' | 'triangle' | 'arrow' | 'line'; // Tipo de figura
  rotation?: number;   // Rotación en grados
}

export interface CursorPosition {
  userId: string;
  email: string;
  position: { x: number; y: number };
}

export interface CloudinaryUploadResult {
  message: string;
  url: string;
  publicId: string;
  width: number;
  height: number;
}

export interface ToastNotification {
  id: number;
  message: string;
  type: 'info' | 'success' | 'warning';
}

@Injectable({ providedIn: 'root' })
export class CanvasService {
  private http = inject(HttpClient);
  private socket!: Socket;
  
  public elements = signal<BoardElement[]>([]);
  public activeCursors = signal<Record<string, CursorPosition>>({});
  public notifications = signal<ToastNotification[]>([]);

  public addNotification(message: string, type: 'info' | 'success' | 'warning' = 'info') {
    const id = Date.now();
    this.notifications.update(n => [...n, { id, message, type }]);
    setTimeout(() => {
      this.notifications.update(n => n.filter(notif => notif.id !== id));
    }, 3500);
  }

  connect(boardId: string, token: string) {
    // Si ya hay un socket activo, desconectarlo limpiamente antes de crear uno nuevo.
    // Esto previene que eventos de tableros anteriores contaminen la sesión actual.
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }

    this.socket = io(environment.apiUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // CORRECCIÓN CRÍTICA: El único punto de entrada para unirse a la sala es el evento
    // 'connect'. No verificamos this.socket.connected porque justo después de io() el
    // socket siempre está en proceso de conexión (connected === false). Registrar 'connect'
    // es la única forma confiable de garantizar que joinBoard se emita una sola vez.
    this.socket.on('connect', () => {
      console.log(`[WSS] Conectado (${this.socket.id}). Uniéndose al tablero ${boardId}...`);
      this.socket.emit('joinBoard', { boardId }, (res: any) => {
        if (res?.success) {
          console.log('🔗 WSS Vinculado Exitosamente:', res);
        } else {
          console.error('❌ joinBoard rechazado:', res);
        }
      });
    });

    this.socket.on('connect_error', (e) => console.warn('[WSS] Error de conexión:', e.message));

    this.socket.on('disconnect', (reason) => {
      console.warn('[WSS] Desconectado:', reason);
    });

    // Recibir actualizaciones del canvas provenientes de OTROS usuarios vía broadcast
    this.socket.on('canvas:update', (incomingElements: BoardElement[]) => {
      this.elements.set(incomingElements);
    });

    // Recibir posiciones de cursores de otros usuarios
    this.socket.on('cursor:move', (data: CursorPosition) => {
      this.activeCursors.update(cursors => ({ ...cursors, [data.userId]: data }));
    });

    // Manejar conexión de usuarios
    this.socket.on('user:joined', (data: { userId: string; email: string }) => {
      this.addNotification(`${data.email} se ha conectado`, 'success');
    });

    // Manejar desconexión de usuarios
    this.socket.on('user:left', (data: { userId: string; email: string }) => {
      this.addNotification(`${data.email} se ha desconectado`, 'warning');
      this.activeCursors.update(cursors => {
        const newCursors = { ...cursors };
        delete newCursors[data.userId];
        return newCursors;
      });
    });
  }

  emitCursorMove(boardId: string, x: number, y: number) {
    if (this.socket?.connected) {
      this.socket.emit('cursor:move', { boardId, position: { x, y } });
    }
  }

  emitCanvasUpdate(boardId: string, elements: BoardElement[]) {
    this.elements.set(elements); // Optimistic UI Update Frontend
    if (this.socket?.connected) {
      this.socket.emit('canvas:update', { boardId, elements }); // Broadcast WSS Backend
    }
  }

  // ─── Cloudinary ───────────────────────────────────────────────────────────
  uploadImage(file: File) {
    const formData = new FormData();
    formData.append('image', file);
    return this.http.post<CloudinaryUploadResult>(`${environment.apiUrl}/files/upload`, formData);
  }

  // ─── Persistencia MongoDB ─────────────────────────────────────────────────
  loadElements(boardId: string) {
    return this.http.get<BoardElement[]>(`${environment.apiUrl}/canvas/${boardId}/elements`);
  }

  saveElements(boardId: string, elements: BoardElement[]) {
    return this.http.put(`${environment.apiUrl}/canvas/${boardId}/elements`, { elements });
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.activeCursors.set({});
    }
  }
}
