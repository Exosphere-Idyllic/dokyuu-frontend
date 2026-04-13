import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Board {
  _id: string;
  title: string;
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
    return this.http.get<{ hostBoards: Board[], memberBoards: any[] }>(this.apiUrl);
  }

  createBoard(title: string, description: string) {
    return this.http.post<Board>(this.apiUrl, { title, description });
  }

  joinBoard(code: string) {
    return this.http.post<any>(`${environment.apiUrl}/members/join`, { code });
  }
}
