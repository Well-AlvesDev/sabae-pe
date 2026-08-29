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
      .legacy-modal {
        width: min(340px, calc(100vw - 32px));
        padding: 20px 16px;
        font-family: Arial, Helvetica, sans-serif;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .legacy-header {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .legacy-header .material-icons {
        font-size: 28px;
        color: #d32f2f;
        flex-shrink: 0;
      }

      .legacy-header h3 {
        margin: 0;
        font-size: clamp(1rem, 4vw, 1.2rem);
        font-weight: 600;
        color: #212121;
      }

      .legacy-body {
        margin: 0;
        padding: 0;
      }

      .legacy-body p {
        margin: 0;
        font-size: clamp(0.9rem, 3.5vw, 1rem);
        line-height: 1.4;
        color: #424242;
      }

      .processing {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 0;
      }

      .processing-text {
        font-weight: 500;
        font-size: clamp(0.85rem, 3vw, 0.95rem);
        color: #424242;
      }

      .legacy-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        flex-wrap: wrap;
      }

      @media (max-width: 380px) {
        .legacy-modal {
          padding: 16px 12px;
        }

        .legacy-actions {
          flex-direction: column;
          gap: 6px;
        }

        .legacy-actions button {
          width: 100%;
        }
      }
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
