import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { supabase, supabaseWithSessionStorage } from '../../supabase';

@Component({
  selector: 'app-logout-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="legacy-modal">
      <div class="legacy-header">
        <span class="material-icons">exit_to_app</span>
        <h3>Confirmar saída</h3>
      </div>

      <div class="legacy-body" *ngIf="!isProcessing">
        <p>Deseja realmente sair da conta?</p>
      </div>

      <div class="legacy-body" *ngIf="isProcessing">
        <div class="processing">
          <mat-progress-spinner diameter="36" mode="indeterminate"></mat-progress-spinner>
          <div class="processing-text">Aguarde, executando logout...</div>
        </div>
      </div>

      <div class="legacy-actions" *ngIf="!isProcessing">
        <button mat-stroked-button (click)="onCancel()">Cancelar</button>
        <button mat-flat-button color="warn" (click)="onConfirm()">
          <mat-icon>exit_to_app</mat-icon>
          Sair
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .legacy-modal { width: 320px; padding: 16px; font-family: Arial, Helvetica, sans-serif; }
      .legacy-header { display:flex; align-items:center; gap:12px; }
      .legacy-header .material-icons { font-size:28px; }
      .legacy-body { margin: 16px 0; }
      .legacy-actions { display:flex; justify-content:flex-end; gap:8px; }
      .processing { display:flex; align-items:center; gap:12px; }
      .processing-text { font-weight:500; }
    `,
  ],
})
export class LogoutConfirmDialogComponent {
  public isProcessing = false;

  constructor(private dialogRef: MatDialogRef<LogoutConfirmDialogComponent>, private router: Router) {}

  async onConfirm(): Promise<void> {
    this.isProcessing = true;
    try {
      await Promise.all([supabase.auth.signOut(), supabaseWithSessionStorage.auth.signOut()]);
    } catch (e) {
      // ignore
    }
    try { localStorage.removeItem('supabase.auth.token'); } catch {}
    try { sessionStorage.removeItem('supabase.auth.token'); } catch {}

    // navigate after a short delay to allow UI to update
    setTimeout(() => {
      try { this.router.navigate(['/login']); } catch {}
      this.dialogRef.close(true);
    }, 200);
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}
