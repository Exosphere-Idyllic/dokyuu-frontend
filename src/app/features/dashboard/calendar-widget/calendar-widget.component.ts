import {
  Component, signal, computed, HostListener,
  OnInit, OnDestroy, Input, Output, EventEmitter
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface CalendarCell {
  date: Date;
  dayNum: number;
  isToday: boolean;
  isSelected: boolean;
  isCurrentMonth: boolean;
  hasEvents: boolean;
}

export interface DateEvent {
  id: string;
  type: 'note' | 'board';
  text: string;
  boardId?: string;
}

const DAY_HEADERS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'];
const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];
const DAY_NAMES = [
  'domingo','lunes','martes','miércoles','jueves','viernes','sábado'
];

@Component({
  selector: 'app-calendar-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './calendar-widget.component.html',
})
export class CalendarWidgetComponent implements OnInit, OnDestroy {
  @Input() anchorRect?: DOMRect;
  @Input() allBoards: any[] = [];

  @Output() close       = new EventEmitter<void>();
  @Output() openCreate  = new EventEmitter<void>();
  @Output() openJoin    = new EventEmitter<void>();
  @Output() navigateToBoard = new EventEmitter<string>();

  readonly dayHeaders = DAY_HEADERS;
  private readonly STORAGE_KEY = 'dokyuu_calendar_events';

  // ─── View mode ───────────────────────────────────────────────────────────
  viewMode = signal<'monthly' | 'weekly'>('monthly');

  // ─── Panels ──────────────────────────────────────────────────────────────
  showSettings  = signal(false);
  showNewEvent  = signal(false);
  showEventPanel = signal(false);

  // ─── Today override ──────────────────────────────────────────────────────
  customToday      = signal<Date | null>(null);
  todayOverrideInput = '';
  effectiveToday   = computed(() => this.customToday() ?? new Date());

  // ─── Month navigation ─────────────────────────────────────────────────────
  viewMonth    = signal(new Date().getMonth());
  viewYear     = signal(new Date().getFullYear());
  selectedDate = signal<Date>(new Date());

  // ─── Events storage ──────────────────────────────────────────────────────
  private eventsMap = signal<Record<string, DateEvent[]>>({});

  selectedDateEvents = computed<DateEvent[]>(() => {
    const key = this.selectedDateKey();
    return this.eventsMap()[key] ?? [];
  });

  eventDatesSet = computed<Set<string>>(() => {
    const map = this.eventsMap();
    return new Set(Object.keys(map).filter(k => (map[k]?.length ?? 0) > 0));
  });

  selectedDateKey = computed(() => {
    const d = this.selectedDate();
    return this.dateToKey(d);
  });

  // ─── Board picker ────────────────────────────────────────────────────────
  showBoardPicker = signal(false);
  newNoteText = '';

  // ─── Position & size ─────────────────────────────────────────────────────
  posX  = signal(0);
  posY  = signal(0);

  // ─── Drag ────────────────────────────────────────────────────────────────
  private dragging    = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  // ─── Interval ────────────────────────────────────────────────────────────
  private tickInterval: any;

  // ─── Calendar grid ───────────────────────────────────────────────────────
  cells = computed<CalendarCell[]>(() => {
    const m     = this.viewMonth();
    const y     = this.viewYear();
    const sel   = this.selectedDate();
    const today = this.effectiveToday();
    const evts  = this.eventDatesSet();

    const firstDay    = new Date(y, m, 1);
    const startDow    = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysInPrev  = new Date(y, m, 0).getDate();

    const cells: CalendarCell[] = [];

    for (let i = startDow - 1; i >= 0; i--) {
      const date = new Date(y, m - 1, daysInPrev - i);
      cells.push({ date, dayNum: date.getDate(), isToday: false, isSelected: false, isCurrentMonth: false, hasEvents: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m, d);
      const key  = this.dateToKey(date);
      cells.push({
        date,
        dayNum: d,
        isToday:        date.toDateString() === today.toDateString(),
        isSelected:     date.toDateString() === sel.toDateString(),
        isCurrentMonth: true,
        hasEvents:      evts.has(key),
      });
    }

    let next = 1;
    while (cells.length < 42) {
      const date = new Date(y, m + 1, next++);
      cells.push({ date, dayNum: date.getDate(), isToday: false, isSelected: false, isCurrentMonth: false, hasEvents: false });
    }

    return cells;
  });

  weekCells = computed<CalendarCell[]>(() => {
    const sel   = this.selectedDate();
    const today = this.effectiveToday();
    const evts  = this.eventDatesSet();

    const start = new Date(sel);
    const dow   = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dow);

    const cells: CalendarCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const key  = this.dateToKey(date);
      cells.push({
        date,
        dayNum:         date.getDate(),
        isToday:        date.toDateString() === today.toDateString(),
        isSelected:     date.toDateString() === sel.toDateString(),
        isCurrentMonth: date.getMonth() === sel.getMonth(),
        hasEvents:      evts.has(key),
      });
    }
    return cells;
  });

  // ─── Display labels ──────────────────────────────────────────────────────
  headerDate = computed(() => {
    const d = this.selectedDate();
    return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} de ${MONTH_NAMES[d.getMonth()].toLowerCase()}`;
  });

  monthLabel = computed(() => MONTH_NAMES[this.viewMonth()]);
  yearLabel  = computed(() => this.viewYear().toString());

  availableBoardsToLink = computed(() => {
    const linked = new Set(
      this.selectedDateEvents()
        .filter(e => e.type === 'board')
        .map(e => e.boardId)
    );
    return this.allBoards.filter(b => !linked.has(b._id));
  });

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  ngOnInit() {
    this.posX.set(Math.max(0, (window.innerWidth  - 340) / 2));
    this.posY.set(Math.max(0, (window.innerHeight - 530) / 2));

    this.loadEventsFromStorage();

    this.tickInterval = setInterval(() => {
      if (!this.customToday()) {
        this.viewMonth.update(m => m);
      }
    }, 60_000);
  }

  ngOnDestroy() {
    clearInterval(this.tickInterval);
  }

  // ─── Storage helpers ─────────────────────────────────────────────────────
  private loadEventsFromStorage() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      this.eventsMap.set(raw ? JSON.parse(raw) : {});
    } catch {
      this.eventsMap.set({});
    }
  }

  private persistEvents() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.eventsMap()));
    } catch {}
  }

  private dateToKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  // ─── Event mutations ─────────────────────────────────────────────────────
  addNote() {
    const text = this.newNoteText.trim();
    if (!text) return;
    const key = this.selectedDateKey();
    const existing = this.eventsMap()[key] ?? [];
    const newEvent: DateEvent = { id: Date.now().toString(), type: 'note', text };
    this.eventsMap.update(m => ({ ...m, [key]: [...existing, newEvent] }));
    this.persistEvents();
    this.newNoteText = '';
  }

  removeEvent(eventId: string) {
    const key = this.selectedDateKey();
    this.eventsMap.update(m => ({
      ...m,
      [key]: (m[key] ?? []).filter(e => e.id !== eventId)
    }));
    this.persistEvents();
  }

  linkBoard(board: any) {
    const key = this.selectedDateKey();
    const existing = this.eventsMap()[key] ?? [];
    const newEvent: DateEvent = {
      id: `board-${board._id}-${Date.now()}`,
      type: 'board',
      text: board.name,
      boardId: board._id
    };
    this.eventsMap.update(m => ({ ...m, [key]: [...existing, newEvent] }));
    this.persistEvents();
    this.showBoardPicker.set(false);
  }

  // ─── View mode ───────────────────────────────────────────────────────────
  setViewMode(mode: 'monthly' | 'weekly') {
    this.viewMode.set(mode);
  }

  // ─── Month navigation ─────────────────────────────────────────────────────
  prevMonth() {
    let m = this.viewMonth() - 1, y = this.viewYear();
    if (m < 0) { m = 11; y--; }
    this.viewMonth.set(m); this.viewYear.set(y);
  }

  nextMonth() {
    let m = this.viewMonth() + 1, y = this.viewYear();
    if (m > 11) { m = 0; y++; }
    this.viewMonth.set(m); this.viewYear.set(y);
  }

  // ─── Cell selection ──────────────────────────────────────────────────────
  selectCell(cell: CalendarCell) {
    this.selectedDate.set(cell.date);
    if (!cell.isCurrentMonth) {
      this.viewMonth.set(cell.date.getMonth());
      this.viewYear.set(cell.date.getFullYear());
    }
    this.showNewEvent.set(false);
    this.showSettings.set(false);
    this.showBoardPicker.set(false);
    this.showEventPanel.set(true);
  }

  // ─── New Event panel ─────────────────────────────────────────────────────
  openNewEventPanel() {
    this.showNewEvent.set(true);
    this.showSettings.set(false);
  }

  closeNewEvent() {
    this.showNewEvent.set(false);
  }

  toggleEventPanel() {
    this.showEventPanel.update(v => !v);
    if (!this.showEventPanel()) {
      this.showBoardPicker.set(false);
    }
  }

  // ─── Settings panel ──────────────────────────────────────────────────────
  toggleSettings() {
    const next = !this.showSettings();
    this.showSettings.set(next);
    this.showNewEvent.set(false);
    if (next) {
      const t  = this.effectiveToday();
      const yy = t.getFullYear();
      const mm = String(t.getMonth() + 1).padStart(2, '0');
      const dd = String(t.getDate()).padStart(2, '0');
      this.todayOverrideInput = `${yy}-${mm}-${dd}`;
    }
  }

  applyDateOverride() {
    if (!this.todayOverrideInput) return;
    const d = new Date(this.todayOverrideInput + 'T12:00:00');
    if (!isNaN(d.getTime())) {
      this.customToday.set(d);
    }
  }

  resetToday() {
    this.customToday.set(null);
    const t  = new Date();
    this.todayOverrideInput = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  }

  // ─── Drag ────────────────────────────────────────────────────────────────
  onDragStart(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button, input, select, textarea')) return;
    this.dragging    = true;
    this.dragOffsetX = e.clientX - this.posX();
    this.dragOffsetY = e.clientY - this.posY();
    e.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent) {
    if (!this.dragging) return;
    this.posX.set(Math.max(0, e.clientX - this.dragOffsetX));
    this.posY.set(Math.max(0, e.clientY - this.dragOffsetY));
  }

  @HostListener('document:mouseup')
  onMouseUp() { this.dragging = false; }
}