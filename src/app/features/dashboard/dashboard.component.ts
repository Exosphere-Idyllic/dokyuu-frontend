import { Component, inject, signal, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BoardsService, Board } from '../../core/boards/boards.service';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService, THEMES, Theme, ThemeId } from '../../core/theme/theme.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  private titleService = inject(Title);
  boardsService = inject(BoardsService);
  authService = inject(AuthService);
  themeService = inject(ThemeService);
  router = inject(Router);


  // ─── Navegación del sidebar ───────────────────────────────────────────────
  activeSidebarTab = signal<'boards' | 'settings'>('boards');

  // ─── Board Signals ────────────────────────────────────────────────────────
  hostBoards = signal<Board[]>([]);
  guestBoards = signal<any[]>([]);

  showCreateModal = signal(false);
  showJoinModal = signal(false);
  showEditModal = signal(false);

  // ─── Profile Modal ────────────────────────────────────────────────────────
  showProfileModal = signal(false);
  profileName = '';
  profileColor = '#00F0FF';
  profileColorInput = '';
  profileSaving = signal(false);

  readonly PALETTE_COLORS = [
    '#00F0FF', '#3B82F6', '#8B5CF6', '#EC4899',
    '#EF4444', '#F97316', '#FBBF24', '#10B981',
    '#14B8A6', '#06B6D4', '#6366F1', '#F43F5E',
  ];

  // ─── Theme ────────────────────────────────────────────────────────────────
  readonly themes: Theme[] = THEMES;

  newTitle = '';
  newDesc = '';
  joinCode = '';

  editBoardId = '';
  editTitle = '';
  editDesc = '';

  loading = signal(false);

  ngOnInit() {
    this.titleService.setTitle('Dokyuu — Panel');
    this.fetchBoards();
  }

  // ─── Sidebar nav ──────────────────────────────────────────────────────────
  setTab(tab: 'boards' | 'settings') {
    this.activeSidebarTab.set(tab);
  }

  // ─── Themes ───────────────────────────────────────────────────────────────
  selectTheme(id: ThemeId) {
    this.themeService.setTheme(id);
  }

  isActiveTheme(id: ThemeId): boolean {
    return this.themeService.currentTheme() === id;
  }

  // ─── Boards ───────────────────────────────────────────────────────────────
  fetchBoards() {
    this.boardsService.getBoards().subscribe({
      next: (boards: any[]) => {
        const hosts = boards.filter(b => b.myRole === 'host');
        const guests = boards
          .filter(b => b.myRole !== 'host')
          .map(b => ({ _id: b._id, name: b.name, description: b.description, role: b.myRole }));
        this.hostBoards.set(hosts);
        this.guestBoards.set(guests);
      }
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/auth']);
  }

  openProfileModal() {
    const user = this.authService.currentUser();
    this.profileName = user?.displayName || user?.email?.split('@')[0] || '';
    this.profileColor = user?.cursorColor || '#00F0FF';
    this.profileColorInput = this.profileColor;
    this.showProfileModal.set(true);
  }

  selectPaletteColor(color: string) {
    this.profileColor = color;
    this.profileColorInput = color;
  }

  onHexInput(value: string) {
    this.profileColorInput = value;
    if (/^#([0-9A-Fa-f]{3}){1,2}$/.test(value) || /^rgb/.test(value)) {
      this.profileColor = value;
    }
  }

  saveProfile() {
    if (!this.profileName.trim()) return;
    this.profileSaving.set(true);
    this.authService.updateProfile(this.profileName.trim(), this.profileColor).subscribe({
      next: () => { this.showProfileModal.set(false); this.profileSaving.set(false); },
      error: () => this.profileSaving.set(false)
    });
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

  openEditModal(event: Event, board: Board) {
    event.stopPropagation();
    this.editBoardId = board._id;
    this.editTitle = board.name;
    this.editDesc = board.description || '';
    this.showEditModal.set(true);
  }

  updateBoard() {
    if (!this.editTitle) return;
    this.loading.set(true);
    this.boardsService.updateBoard(this.editBoardId, this.editTitle, this.editDesc).subscribe({
      next: () => { this.showEditModal.set(false); this.loading.set(false); this.fetchBoards(); },
      error: () => this.loading.set(false)
    });
  }

  deleteBoard() {
    if (!confirm('¿Estás seguro de que deseas eliminar esta pizarra? Esta acción no se puede deshacer.')) return;
    this.loading.set(true);
    this.boardsService.deleteBoard(this.editBoardId).subscribe({
      next: () => { this.showEditModal.set(false); this.loading.set(false); this.fetchBoards(); },
      error: () => { this.loading.set(false); alert('Error al eliminar la pizarra'); }
    });
  }

  openBoard(id: string) {
    this.router.navigate(['/board', id]);
  }
}