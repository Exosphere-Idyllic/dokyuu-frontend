import { Component, OnInit, OnDestroy, signal, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loading.component.html',
  styleUrls: ['./loading.component.css'],
})
export class LoadingComponent implements OnInit, OnDestroy {
  /**
   * Array de mensajes que rotan cada 3s durante la carga.
   * Simula una secuencia de preparación para la pizarra digital.
   */
  private readonly messages: string[] = [
    'Preparando el lienzo',
    'Afilando los lápices',
    'Cargando herramientas',
    'Organizando el espacio',
    'Casi listo',
  ];

  /** Índice reactivo del mensaje actualmente visible */
  private messageIndex = 0;

  /** Señal que emite el texto del mensaje actual al template */
  currentMessage = signal<string>(this.messages[0]);

  /** Referencia al intervalo para limpieza en OnDestroy */
  private intervalId: ReturnType<typeof setInterval> | null = null;

  /** Flag visual para activar la animación de fundido de salida */
  isFadingOut = false;

  /** Evento que el padre escucha para saber cuándo terminó el fundido */
  @Output() fadeOutDone = new EventEmitter<void>();

  ngOnInit(): void {
    this.intervalId = setInterval(() => {
      this.messageIndex = (this.messageIndex + 1) % this.messages.length;
      this.currentMessage.set(this.messages[this.messageIndex]);
    }, 3000);
  }

  /**
   * Inicia el fundido de salida. El padre llama este método
   * cuando la carga real termina, dando tiempo a la transición CSS.
   */
  startFadeOut(): void {
    this.isFadingOut = true;
    setTimeout(() => {
      this.fadeOutDone.emit();
    }, 800); // Coincide con la duración de la transición CSS
  }

  ngOnDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
