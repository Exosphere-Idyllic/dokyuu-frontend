import { Component, inject, signal, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { BoardsService, Board } from '../../core/boards/boards.service';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService, THEMES, Theme, ThemeId } from '../../core/theme/theme.service';
import { CalendarWidgetComponent } from './calendar-widget/calendar-widget.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, CalendarWidgetComponent],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit, OnDestroy {
  private titleService = inject(Title);
  private http = inject(HttpClient);
  boardsService = inject(BoardsService);
  authService = inject(AuthService);
  themeService = inject(ThemeService);
  router = inject(Router);

  // ─── Timezone Config & Time API ───────────────────────────────────────────
  readonly TIMEZONES = [
    'UTC', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos',
    'America/Anchorage', 'America/Argentina/Buenos_Aires', 'America/Bogota',
    'America/Caracas', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Mexico_City', 'America/New_York', 'America/Phoenix',
    'America/Santiago', 'America/Sao_Paulo', 'Asia/Bangkok', 'Asia/Dubai',
    'Asia/Hong_Kong', 'Asia/Istanbul', 'Asia/Jakarta', 'Asia/Jerusalem',
    'Asia/Kolkata', 'Asia/Manila', 'Asia/Riyadh', 'Asia/Seoul', 'Asia/Shanghai',
    'Asia/Singapore', 'Asia/Tokyo', 'Australia/Adelaide', 'Australia/Brisbane',
    'Australia/Melbourne', 'Australia/Sydney', 'Europe/Amsterdam', 'Europe/Berlin',
    'Europe/Brussels', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/London',
    'Europe/Madrid', 'Europe/Paris', 'Europe/Rome', 'Europe/Vienna',
    'Europe/Warsaw', 'Europe/Zurich', 'Pacific/Auckland', 'Pacific/Honolulu'
  ];

  selectedTimezone = signal<string>('UTC');
  use24h = signal<boolean>(true);
  timezoneTime = signal<string>('');
  timezoneLoading = signal<boolean>(false);
  private timezoneOffsetMs = 0;
  private timezoneInterval: any;

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

  // ─── Calendar ─────────────────────────────────────────────────────────────
  showCalendar = signal(false);
  calendarAnchorRect?: DOMRect;
  @ViewChild('calendarBtn') calendarBtnRef!: ElementRef<HTMLButtonElement>;

  toggleCalendar() {
    if (!this.showCalendar()) {
      this.calendarAnchorRect = this.calendarBtnRef.nativeElement.getBoundingClientRect();
    }
    this.showCalendar.update(v => !v);
  }

  ngOnInit() {
    this.titleService.setTitle('Dokyuu — Panel');
    this.fetchBoards();

    // Detect timezone
    try {
      const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (this.TIMEZONES.includes(userTz)) {
        this.selectedTimezone.set(userTz);
      } else {
        const matched = this.TIMEZONES.find(tz => tz.split('/')[1] === userTz.split('/')[1]);
        if (matched) this.selectedTimezone.set(matched);
      }
    } catch (e) {}

    this.fetchTimezoneTime(this.selectedTimezone());

    // Local tick interval
    this.timezoneInterval = setInterval(() => {
      this.updateTimezoneClock();
    }, 1000);
  }

  ngOnDestroy() {
    if (this.timezoneInterval) {
      clearInterval(this.timezoneInterval);
    }
  }

  // ─── Timezone clock methods ────────────────────────────────────────────────
  onTimezoneChange(newTz: string) {
    this.selectedTimezone.set(newTz);
    this.fetchTimezoneTime(newTz);
  }

  toggleTimeFormat() {
    this.use24h.update(v => !v);
    this.updateTimezoneClock();
  }

  private fetchTimezoneTime(tz: string) {
    this.timezoneLoading.set(true);
    this.http.get<any>(`https://timeapi.io/api/time/current/zone?timeZone=${encodeURIComponent(tz)}`).subscribe({
      next: (res) => {
        if (res && res.dateTime) {
          const apiTime = new Date(res.dateTime);
          const localTime = new Date();
          if (!isNaN(apiTime.getTime())) {
            this.timezoneOffsetMs = apiTime.getTime() - localTime.getTime();
          }
        }
        this.updateTimezoneClock();
        this.timezoneLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching timezone from API, falling back to local offset:', err);
        this.timezoneOffsetMs = 0;
        this.updateTimezoneClock();
        this.timezoneLoading.set(false);
      }
    });
  }

  private updateTimezoneClock() {
    const time = new Date(Date.now() + this.timezoneOffsetMs);
    try {
      const formatted = new Intl.DateTimeFormat('es-ES', {
        timeZone: this.selectedTimezone(),
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: !this.use24h(),
      }).format(time);
      this.timezoneTime.set(formatted);
    } catch (e) {
      this.timezoneTime.set(time.toLocaleTimeString());
    }
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