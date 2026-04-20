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
  imageUrl?: string;
  width?: number;
  height?: number;
  shapeType?: 'square' | 'circle' | 'triangle' | 'arrow' | 'line';
  rotation?: number;
}

export interface CursorPosition {
  userId: string;
  email: string;
  displayName?: string;
  cursorColor?: string;
  position: { x: number; y: number };
}

export interface ConnectedUser {
  socketId: string;
  userId: string;
  email: string;
  displayName: string;
  cursorColor: string;
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
  type: 'info' | 'success' | 'warning' | 'error';
}

@Injectable({ providedIn: 'root' })
export class CanvasService {
  private http = inject(HttpClient);
  private socket!: Socket;

  public elements = signal<BoardElement[]>([]);
  public activeCursors = signal<Record<string, CursorPosition>>({});
  public notifications = signal<ToastNotification[]>([]);

  // Lista de usuarios actualmente conectados a la sala
  public connectedUsers = signal<ConnectedUser[]>([]);

  // Evento para notificar al componente que el usuario fue expulsado
  public onKicked: ((data: { boardId: string; message: string }) => void) | null = null;

  public addNotification(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    const id = Date.now();
    this.notifications.update(n => [...n, { id, message, type }]);
    setTimeout(() => {
      this.notifications.update(n => n.filter(notif => notif.id !== id));
    }, 3500);
  }

  connect(boardId: string, token: string) {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }

    // Limpiar estado al conectar
    this.connectedUsers.set([]);

    this.socket = io(environment.apiUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

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

    // Lista completa de usuarios conectados (actualizada por el servidor)
    this.socket.on('room:users', (users: ConnectedUser[]) => {
      this.connectedUsers.set(users);
    });

    // Recibir actualizaciones del canvas
    this.socket.on('canvas:update', (incomingElements: BoardElement[]) => {
      this.elements.set(incomingElements);
    });

    // Recibir posiciones de cursores
    this.socket.on('cursor:move', (data: CursorPosition) => {
      this.activeCursors.update(cursors => ({ ...cursors, [data.userId]: data }));
    });

    // Usuario conectado
    this.socket.on('user:joined', (data: { userId: string; email: string; displayName?: string; cursorColor?: string }) => {
      const name = data.displayName || data.email.split('@')[0];
      this.addNotification(`${name} se ha conectado`, 'success');
    });

    // Usuario desconectado
    this.socket.on('user:left', (data: { userId: string; email: string; displayName?: string }) => {
      const name = data.displayName || data.email.split('@')[0];
      this.addNotification(`${name} se ha desconectado`, 'warning');
      this.activeCursors.update(cursors => {
        const newCursors = { ...cursors };
        delete newCursors[data.userId];
        return newCursors;
      });
    });

    // El usuario actual fue expulsado
    this.socket.on('kicked', (data: { boardId: string; message: string }) => {
      console.warn('[WSS] Expulsado de la sala:', data);
      this.addNotification('Has sido expulsado de la pizarra.', 'error');
      if (this.onKicked) {
        this.onKicked(data);
      }
    });
  }

  emitCursorMove(boardId: string, x: number, y: number) {
    if (this.socket?.connected) {
      this.socket.emit('cursor:move', { boardId, position: { x, y } });
    }
  }

  emitCanvasUpdate(boardId: string, elements: BoardElement[]) {
    this.elements.set(elements);
    if (this.socket?.connected) {
      this.socket.emit('canvas:update', { boardId, elements });
    }
  }

  /**
   * Expulsar a un usuario de la sala (solo host)
   */
  kickUser(boardId: string, targetUserId: string): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({ success: false, message: 'Sin conexión al servidor' });
        return;
      }
      this.socket.emit('kick:user', { boardId, targetUserId }, (res: any) => {
        resolve(res ?? { success: false, message: 'Sin respuesta del servidor' });
      });
    });
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
      this.connectedUsers.set([]);
    }
  }
}