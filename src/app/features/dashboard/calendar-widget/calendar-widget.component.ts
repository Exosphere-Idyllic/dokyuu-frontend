import {
  Component, signal, computed, HostListener,
  OnInit, OnDestroy, Input, Output, EventEmitter
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface CalendarCell {
  date: Date;
  dayNum: number;
  isToday: boolean;
  isSelected: boolean;
  isCurrentMonth: boolean;
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
  @Output() close       = new EventEmitter<void>();
  @Output() openCreate  = new EventEmitter<void>();
  @Output() openJoin    = new EventEmitter<void>();

  readonly dayHeaders = DAY_HEADERS;

  // ─── View mode ───────────────────────────────────────────────────────────
  viewMode = signal<'monthly' | 'weekly'>('monthly');

  // ─── Panels ──────────────────────────────────────────────────────────────
  showSettings = signal(false);
  showNewEvent = signal(false);

  // ─── Today override (settings panel) ─────────────────────────────────────
  customToday      = signal<Date | null>(null);
  todayOverrideInput = '';
  effectiveToday   = computed(() => this.customToday() ?? new Date());

  // ─── Month navigation ─────────────────────────────────────────────────────
  viewMonth    = signal(new Date().getMonth());
  viewYear     = signal(new Date().getFullYear());
  selectedDate = signal<Date>(new Date());

  // ─── Position & size ─────────────────────────────────────────────────────
  posX  = signal(0);
  posY  = signal(0);
  width = signal(340);

  // ─── Drag ────────────────────────────────────────────────────────────────
  private dragging    = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  // ─── Interval for today-dot refresh ─────────────────────────────────────
  private tickInterval: any;

  // ─── 42-cell monthly grid ────────────────────────────────────────────────
  cells = computed<CalendarCell[]>(() => {
    const m     = this.viewMonth();
    const y     = this.viewYear();
    const sel   = this.selectedDate();
    const today = this.effectiveToday();

    const firstDay    = new Date(y, m, 1);
    const startDow    = (firstDay.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysInPrev  = new Date(y, m,     0).getDate();

    const cells: CalendarCell[] = [];

    // Leading days from previous month
    for (let i = startDow - 1; i >= 0; i--) {
      const date = new Date(y, m - 1, daysInPrev - i);
      cells.push({ date, dayNum: date.getDate(), isToday: false, isSelected: false, isCurrentMonth: false });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m, d);
      cells.push({
        date,
        dayNum: d,
        isToday:         date.toDateString() === today.toDateString(),
        isSelected:      date.toDateString() === sel.toDateString(),
        isCurrentMonth:  true,
      });
    }

    // Trailing days to fill to 42
    let next = 1;
    while (cells.length < 42) {
      const date = new Date(y, m + 1, next++);
      cells.push({ date, dayNum: date.getDate(), isToday: false, isSelected: false, isCurrentMonth: false });
    }

    return cells;
  });

  // ─── Weekly view: 7 days of the selected date's week ─────────────────────
  weekCells = computed<CalendarCell[]>(() => {
    const sel   = this.selectedDate();
    const today = this.effectiveToday();

    // Start from Monday of selected date's week
    const start = new Date(sel);
    const dow   = (start.getDay() + 6) % 7; // Mon=0
    start.setDate(start.getDate() - dow);

    const cells: CalendarCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      cells.push({
        date,
        dayNum:         date.getDate(),
        isToday:        date.toDateString() === today.toDateString(),
        isSelected:     date.toDateString() === sel.toDateString(),
        isCurrentMonth: date.getMonth() === sel.getMonth(),
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

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  ngOnInit() {
    this.posX.set(Math.max(0, (window.innerWidth  - this.width()) / 2));
    this.posY.set(Math.max(0, (window.innerHeight - 530) / 2));

    // Refresh "today" dot every minute
    this.tickInterval = setInterval(() => {
      if (!this.customToday()) {
        this.viewMonth.update(m => m);
      }
    }, 60_000);
  }

  ngOnDestroy() {
    clearInterval(this.tickInterval);
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
    this.showNewEvent.set(true);
    this.showSettings.set(false);
  }

  // ─── New Event panel ─────────────────────────────────────────────────────
  openNewEventPanel() {
    this.showNewEvent.set(true);
    this.showSettings.set(false);
  }

  closeNewEvent() {
    this.showNewEvent.set(false);
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
    const yy = t.getFullYear();
    const mm = String(t.getMonth() + 1).padStart(2, '0');
    const dd = String(t.getDate()).padStart(2, '0');
    this.todayOverrideInput = `${yy}-${mm}-${dd}`;
  }

  // ─── Drag ────────────────────────────────────────────────────────────────
  onDragStart(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button, input, select')) return;
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