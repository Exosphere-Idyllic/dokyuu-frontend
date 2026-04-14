import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { tap } from 'rxjs';

export interface UserState { token: string; email: string; sub: string; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private api = environment.apiUrl + '/auth';
  
  // Storage and Signal (Signals permiten al UI reacionar al instante si el null cambia)
  public currentUser = signal<UserState | null>(this.loadFromStorage());

  login(email: string, pass: string) {
    return this.http.post<any>(`${this.api}/login`, { email, password: pass }).pipe(
      tap((res: any) => this.saveSession(res))
    );
  }

  register(email: string, pass: string, name: string) {
    return this.http.post<any>(`${this.api}/register`, { email, password: pass, displayName: name }).pipe(
      tap((res: any) => this.saveSession(res))
    );
  }

  logout() {
    localStorage.removeItem('dokyuu_token');
    localStorage.removeItem('dokyuu_user');
    this.currentUser.set(null);
  }

  private loadFromStorage(): UserState | null {
    const token = localStorage.getItem('dokyuu_token');
    const userStr = localStorage.getItem('dokyuu_user');
    if (token && userStr) {
      return { token, ...JSON.parse(userStr) };
    }
    return null;
  }

  private saveSession(res: any) {
    // CORRECCIÓN: El backend retorna user._id (no user.sub).
    // Normalizamos a sub para que el resto de la app use un campo consistente.
    const sub = res.user.sub || res.user._id;
    const sessionData = { email: res.user.email, sub };

    localStorage.setItem('dokyuu_token', res.access_token);
    localStorage.setItem('dokyuu_user', JSON.stringify(sessionData));
    this.currentUser.set({ token: res.access_token, email: res.user.email, sub });
  }
}
