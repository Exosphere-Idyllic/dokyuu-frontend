import { Component, ElementRef, OnInit, OnDestroy, ViewChild, HostListener } from '@angular/core';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

@Component({
  selector: 'app-interactive-bg',
  standalone: true,
  templateUrl: './interactive-bg.component.html',
  styleUrl: './interactive-bg.component.css'
})
export class InteractiveBgComponent implements OnInit, OnDestroy {
  @ViewChild('bgCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  
  private ctx!: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private animationFrameId!: number;
  private mouse = { x: -1000, y: -1000, active: false };
  private colors = { accent: '#00F0FF', accentRgb: '0, 240, 255' };

  ngOnInit() {
    this.initCanvas();
    this.updateColors();
    this.createParticles();
    this.animate();
    
    window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.onResize);
  }

  private initCanvas() {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.resizeCanvas();
  }

  private resizeCanvas() {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  private onResize = () => {
    this.resizeCanvas();
    this.createParticles();
  };

  private updateColors() {
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue('--color-accent').trim() || '#00F0FF';
    
    // Parse hex or rgb
    if (accent.startsWith('#')) {
      const hex = accent.substring(1);
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      this.colors.accent = accent;
      this.colors.accentRgb = `${r}, ${g}, ${b}`;
    } else if (accent.startsWith('rgb')) {
      // Extract numbers from rgb/rgba
      const matches = accent.match(/\d+/g);
      if (matches && matches.length >= 3) {
        this.colors.accent = accent;
        this.colors.accentRgb = `${matches[0]}, ${matches[1]}, ${matches[2]}`;
      }
    } else {
      this.colors.accent = accent;
      // If color format is something else, fallback or keep it
      // Standard browsers can parse colors via temporary elements if necessary, 
      // but the themes defined in styles.css are simple hex codes, so this is perfect.
      this.colors.accentRgb = '0, 240, 255'; 
    }
  }

  private createParticles() {
    const canvas = this.canvasRef.nativeElement;
    const particleCount = Math.min(60, Math.floor((canvas.width * canvas.height) / 30000));
    this.particles = [];
    
    for (let i = 0; i < particleCount; i++) {
      this.particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 2 + 1
      });
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    this.mouse.x = event.clientX;
    this.mouse.y = event.clientY;
    this.mouse.active = true;
  }

  @HostListener('document:mouseleave')
  onMouseLeave() {
    this.mouse.active = false;
    this.mouse.x = -1000;
    this.mouse.y = -1000;
  }

  private animate = () => {
    this.updateColors();
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    const distLimit = 120;
    
    for (let i = 0; i < this.particles.length; i++) {
      const p1 = this.particles[i];
      p1.x += p1.vx;
      p1.y += p1.vy;

      if (p1.x < 0) p1.x = canvas.width;
      if (p1.x > canvas.width) p1.x = 0;
      if (p1.y < 0) p1.y = canvas.height;
      if (p1.y > canvas.height) p1.y = 0;

      // Draw particle
      this.ctx.beginPath();
      this.ctx.arc(p1.x, p1.y, p1.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${this.colors.accentRgb}, 0.4)`;
      this.ctx.fill();

      // Connections
      for (let j = i + 1; j < this.particles.length; j++) {
        const p2 = this.particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < distLimit) {
          const alpha = (1 - dist / distLimit) * 0.12;
          this.ctx.strokeStyle = `rgba(${this.colors.accentRgb}, ${alpha})`;
          this.ctx.lineWidth = 0.8;
          this.ctx.beginPath();
          this.ctx.moveTo(p1.x, p1.y);
          this.ctx.lineTo(p2.x, p2.y);
          this.ctx.stroke();
        }
      }

      // Mouse interaction
      if (this.mouse.active) {
        const dx = p1.x - this.mouse.x;
        const dy = p1.y - this.mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 180) {
          const alpha = (1 - dist / 180) * 0.2;
          this.ctx.strokeStyle = `rgba(${this.colors.accentRgb}, ${alpha})`;
          this.ctx.lineWidth = 0.9;
          this.ctx.beginPath();
          this.ctx.moveTo(p1.x, p1.y);
          this.ctx.lineTo(this.mouse.x, this.mouse.y);
          this.ctx.stroke();
          
          // Subtle attraction force
          p1.vx += (dx / dist) * -0.003;
          p1.vy += (dy / dist) * -0.003;
          
          // Speed cap
          const speed = Math.sqrt(p1.vx * p1.vx + p1.vy * p1.vy);
          if (speed > 1.2) {
            p1.vx = (p1.vx / speed) * 1.2;
            p1.vy = (p1.vy / speed) * 1.2;
          }
        } else {
          // Friction to slow down to base speed
          p1.vx *= 0.99;
          p1.vy *= 0.99;
        }
      }
    }

    this.animationFrameId = requestAnimationFrame(this.animate);
  };
}
