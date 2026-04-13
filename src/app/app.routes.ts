import { Routes } from '@angular/router';
import { AuthComponent } from './features/auth/auth.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { BoardComponent } from './features/board/board.component';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
    { path: 'auth', component: AuthComponent },
    { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
    { path: 'board/:id', component: BoardComponent, canActivate: [authGuard] },
    { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    { path: '**', redirectTo: 'auth' }
];
