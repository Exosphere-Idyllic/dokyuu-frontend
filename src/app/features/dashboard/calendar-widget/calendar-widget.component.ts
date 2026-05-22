import {
  Component, signal, computed, HostListener,
  OnInit, Input, Output, EventEmitter
} from '@angular/core';
import { CommonModule } from '@angular/common';

interface CalendarCell {
  date: Date;
  dayNum: number;
  isToday: boolean;
  isSelected: boolean;
  isCurrentMonth: boolean;
}

const DAY_HEADERS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'];
const MONTH_NAMES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre'
];
const DAY_NAMES = [
  'domingo','lunes','martes','miércoles','jueves','viernes','sábado'
];

@Component({
  selector: 'app-calendar-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calendar-widget.component.html',
})
export class CalendarWidgetComponent implements OnInit {
  @Input() anchorRect?: DOMRect;
  @Output() close = new EventEmitter<void>();

  readonly dayHeaders = DAY_HEADERS;

  today = new Date();
  viewMonth = signal(new Date().getMonth());
  viewYear  = signal(new Date().getFullYear());
  selectedDate = signal<Date>(new Date());

  // Position & size
  posX   = signal(0);
  posY   = signal(0);
  width  = signal(360);

  // Drag
  private dragging    = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  // ─── Grid cells: fills a 6×7 grid with prev/current/next month days ───────
  cells = computed<CalendarCell[]>(() => {
    const m   = this.viewMonth();
    const y   = this.viewYear();
    const sel = this.selectedDate();
    const today = this.today;

    const firstDay  = new Date(y, m, 1);
    // Monday-based: Monday=0 … Sunday=6
    const startDow  = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysInPrev  = new Date(y, m, 0).getDate();

    const cells: CalendarCell[] = [];

    // Fill leading days from previous month
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
        isToday: date.toDateString() === today.toDateString(),
        isSelected: date.toDateString() === sel.toDateString(),
        isCurrentMonth: true,
      });
    }

    // Fill trailing days from next month to complete the grid (up to 42 cells)
    let next = 1;
    while (cells.length < 42) {
      const date = new Date(y, m + 1, next++);
      cells.push({ date, dayNum: date.getDate(), isToday: false, isSelected: false, isCurrentMonth: false });
    }

    return cells;
  });

  headerDate = computed(() => {
    const d = this.selectedDate();
    return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`;
  });

  monthLabel = computed(() => `${MONTH_NAMES[this.viewMonth()]} de ${this.viewYear()}`);

  ngOnInit() {
    this.posX.set((window.innerWidth  - this.width()) / 2);
    this.posY.set((window.innerHeight - 480) / 2);
  }

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

  selectCell(cell: CalendarCell) {
    this.selectedDate.set(cell.date);
    if (!cell.isCurrentMonth) {
      this.viewMonth.set(cell.date.getMonth());
      this.viewYear.set(cell.date.getFullYear());
    }
  }

  onDragStart(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
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