import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BoardsService, Board } from '../../core/boards/boards.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  boardsService = inject(BoardsService);
  authService = inject(AuthService);
  router = inject(Router);

  hostBoards = signal<Board[]>([]);
  guestBoards = signal<any[]>([]); 

  showCreateModal = signal(false);
  showJoinModal = signal(false);
  
  newTitle = '';
  newDesc = '';
  joinCode = '';
  
  loading = signal(false);

  ngOnInit() {
    this.fetchBoards();
  }

  fetchBoards() {
    this.boardsService.getBoards().subscribe({
      next: (boards: any[]) => {
        const hosts = boards.filter(b => b.myRole === 'host');
        // CORRECCIÓN: estructura plana y explícita en vez de anidar en boardId
        const guests = boards.filter(b => b.myRole !== 'host').map(b => ({
          _id: b._id,
          name: b.name,
          description: b.description,
          role: b.myRole
        }));
        
        this.hostBoards.set(hosts);
        this.guestBoards.set(guests);
      }
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/auth']);
  }

  createBoard() {
    if (!this.newTitle) return;
    this.loading.set(true);
    this.boardsService.createBoard(this.newTitle, this.newDesc).subscribe({
      next: (board: any) => {
        this.hostBoards.update(b => [...b, board]);
        this.showCreateModal.set(false);
        this.newTitle = '';
        this.newDesc = '';
        this.loading.set(false);
      },
      error: () => this.loading.set(false) 
    });
  }

  joinBoard() {
    if (!this.joinCode) return;
    this.loading.set(true);
    this.boardsService.joinBoard(this.joinCode).subscribe({
      next: () => {
        this.showJoinModal.set(false);
        this.joinCode = '';
        this.loading.set(false);
        this.fetchBoards(); 
      },
      error: (e: any) => {
        alert(e.error?.message || 'Código inválido');
        this.loading.set(false);
      }
    });
  }

  openBoard(id: string) {
    this.router.navigate(['/board', id]);
  }
}
