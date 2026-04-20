import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Board {
  _id: string;
  name: string;
  description: string;
  memberCode: string;
  readerCode: string;
  createdBy: string;
  createdAt: Date;
}

@Injectable({
  providedIn: 'root'
})
export class BoardsService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl + '/boards';

  getBoards() {
    return this.http.get<any[]>(this.apiUrl);
  }

  createBoard(name: string, description: string) {
    return this.http.post<Board>(this.apiUrl, { name, description });
  }

  joinBoard(code: string) {
    return this.http.post<any>(`${environment.apiUrl}/members/join`, { code });
  }

  updateBoard(id: string, name: string, description: string) {
    return this.http.put<Board>(`${this.apiUrl}/${id}`, { name, description });
  }

  deleteBoard(id: string) {
    return this.http.delete<any>(`${this.apiUrl}/${id}`);
  }
}
