import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { firstValueFrom } from 'rxjs';

export interface Task {
  _id: string;
  boardId: string;
  assignedTo: {
    _id: string;
    displayName?: string;
    email: string;
  };
  assignedBy: string;
  title: string;
  description?: string;
  status: 'active' | 'completed';
  elementIds: string[];
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class TasksService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/tasks`;

  myTasks = signal<Task[]>([]);
  boardTasks = signal<Task[]>([]);

  // Capture session details
  isCapturing = signal<boolean>(false);
  capturingTaskId = signal<string | null>(null);

  async loadMyTasks(boardId: string): Promise<void> {
    try {
      const tasks = await firstValueFrom(
        this.http.get<Task[]>(`${this.apiUrl}/my/${boardId}`)
      );
      this.myTasks.set(tasks);
    } catch (error) {
      console.error('Error loading my tasks:', error);
    }
  }

  async loadBoardTasks(boardId: string): Promise<void> {
    try {
      const tasks = await firstValueFrom(
        this.http.get<Task[]>(`${this.apiUrl}/board/${boardId}`)
      );
      this.boardTasks.set(tasks);
    } catch (error) {
      console.error('Error loading board tasks:', error);
    }
  }

  async createTask(boardId: string, title: string, description: string, assignedTo: string): Promise<Task> {
    const task = await firstValueFrom(
      this.http.post<Task>(`${this.apiUrl}/board/${boardId}`, {
        title,
        description,
        assignedTo
      })
    );
    this.boardTasks.update(tasks => [...tasks, task]);
    return task;
  }

  async completeTask(taskId: string): Promise<Task> {
    const task = await firstValueFrom(
      this.http.patch<Task>(`${this.apiUrl}/${taskId}/complete`, {})
    );

    // Update tasks in local states
    this.myTasks.update(tasks =>
      tasks.map(t => (t._id === taskId ? { ...t, status: 'completed', completedAt: task.completedAt } : t))
    );
    this.boardTasks.update(tasks =>
      tasks.map(t => (t._id === taskId ? { ...t, status: 'completed', completedAt: task.completedAt } : t))
    );

    // If this task was being captured, stop capturing
    if (this.capturingTaskId() === taskId) {
      this.stopCapture();
    }

    return task;
  }

  async addElementToTask(taskId: string, elementId: string): Promise<Task> {
    const task = await firstValueFrom(
      this.http.patch<Task>(`${this.apiUrl}/${taskId}/elements`, { elementId })
    );

    this.boardTasks.update(tasks =>
      tasks.map(t => (t._id === taskId ? { ...t, elementIds: [...t.elementIds, elementId] } : t))
    );
    this.myTasks.update(tasks =>
      tasks.map(t => (t._id === taskId ? { ...t, elementIds: [...t.elementIds, elementId] } : t))
    );

    return task;
  }

  startCapture(taskId: string): void {
    this.isCapturing.set(true);
    this.capturingTaskId.set(taskId);
  }

  stopCapture(): void {
    this.isCapturing.set(false);
    this.capturingTaskId.set(null);
  }
}
