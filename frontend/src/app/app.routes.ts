import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'today' },
  { path: 'today', loadComponent: () => import('./features/today.component').then(m => m.TodayComponent) },
  { path: 'task/:id', loadComponent: () => import('./features/task-detail.component').then(m => m.TaskDetailComponent) },
  { path: 'focus/:id', loadComponent: () => import('./features/focus.component').then(m => m.FocusComponent) },
  { path: 'breaks', loadComponent: () => import('./features/breaks.component').then(m => m.BreaksComponent) },
  { path: 'insights', loadComponent: () => import('./features/insights.component').then(m => m.InsightsComponent) },
  { path: 'settings', loadComponent: () => import('./features/settings.component').then(m => m.SettingsComponent) },
  { path: '**', redirectTo: 'today' }
];
