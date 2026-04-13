import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';

export interface BoardElement {
  id: string;
  type: 'note';
  content: string;
  x: number;
  y: number;
  color: string;
  createdBy: string;
}

export interface CursorPosition {
  userId: string;
  email: string;
  position: { x: number; y: number };
}

@Injectable({ providedIn: 'root' })
export class CanvasService {
  private http = inject(HttpClient);
  private socket!: Socket;
  
  public elements = signal<BoardElement[]>([]);
  public activeCursors = signal<Record<string, CursorPosition>>({});

  connect(boardId: string, token: string) {
    this.socket = io(environment.apiUrl, { 
      auth: { token },
      transports: ['websocket']
    });

    this.socket.on('connect', () => {
      this.socket.emit('joinBoard', { boardId }, (res: any) => {
        console.log('🔗 WSS Vinculado Exitosamente:', res);
      });
    });

    this.socket.on('canvas:update', (incomingElements: BoardElement[]) => {
      this.elements.set(incomingElements);
    });

    this.socket.on('cursor:move', (data: CursorPosition) => {
      this.activeCursors.update(cursors => ({ ...cursors, [data.userId]: data }));
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

  // Persistencia MongoDB
  loadElements(boardId: string) {
    return this.http.get<BoardElement[]>(`${environment.apiUrl}/canvas/${boardId}/elements`);
  }

  saveElements(boardId: string, elements: BoardElement[]) {
    return this.http.put(`${environment.apiUrl}/canvas/${boardId}/elements`, { elements });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.activeCursors.set({});
    }
  }
}
