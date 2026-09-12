import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export type SessionConflictAction = 'login' | 'reset';

@Component({
  selector: 'app-session-conflict-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="session-conflict-dialog">
      <div class="dialog-header">
        <mat-icon aria-hidden="true">devices</mat-icon>
        <h2 mat-dialog-title>Sessão encerrada</h2>
      </div>

      <mat-dialog-content>
        <p>Sua conta foi acessada em outro dispositivo e esta sessão foi encerrada.</p>
        <p>Por segurança, o sistema permite apenas uma sessão ativa por vez.</p>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-stroked-button type="button" (click)="close('login')">
          Voltar para a tela de login
        </button>
        <button mat-flat-button color="primary" type="button" (click)="close('reset')">
          Redefinir minha senha
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .session-conflict-dialog {
      padding: 8px 4px 4px;
      max-width: 520px;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      gap: 12px;
      color: #b3261e;
    }

    .dialog-header h2 {
      margin: 0;
      font-size: 1.25rem;
    }

    mat-dialog-content {
      padding-top: 12px;
      color: #424242;
      line-height: 1.5;
    }

    mat-dialog-content p {
      margin: 0 0 8px;
    }

    mat-dialog-actions {
      gap: 8px;
      flex-wrap: wrap;
    }

    @media (max-width: 520px) {
      mat-dialog-actions {
        align-items: stretch;
        flex-direction: column-reverse;
      }

      mat-dialog-actions button {
        width: 100%;
      }
    }
  `],
})
export class SessionConflictDialogComponent {
  constructor(
    private readonly dialogRef: MatDialogRef<SessionConflictDialogComponent, SessionConflictAction>,
    @Inject(MAT_DIALOG_DATA) readonly data: { email?: string },
  ) {}

  close(action: SessionConflictAction): void {
    this.dialogRef.close(action);
  }
}