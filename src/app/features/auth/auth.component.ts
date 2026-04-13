import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './auth.component.html',
})
export class AuthComponent {
  isLogin = signal<boolean>(true);
  loading = signal<boolean>(false);
  errorMsg = signal<string | null>(null);

  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  authForm = this.fb.group({
    name: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  toggleMode() {
    this.isLogin.set(!this.isLogin());
    this.errorMsg.set(null);
    this.authForm.reset();
  }

  onSubmit() {
    if (this.authForm.invalid) return;
    this.loading.set(true);
    this.errorMsg.set(null);
    
    const { email, password, name } = this.authForm.value;

    const request$ = this.isLogin() 
      ? this.authService.login(email!, password!)
      : this.authService.register(email!, password!, name!);

    request$.subscribe({
      next: (res: any) => {
        this.loading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err: any) => {
        this.loading.set(false);
        this.errorMsg.set(err.error?.message || 'Error de conexión. Verifica que el servidor Backend este corriendo.');
      }
    });
  }
}
