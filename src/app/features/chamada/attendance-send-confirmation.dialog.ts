import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-attendance-send-confirmation-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="attendance-send-confirm-dialog">
      <div class="dialog-header">
        <span class="material-icons" aria-hidden="true">cloud_upload</span>
        <h3>Enviar chamadas para o banco?</h3>
      </div>

      <p>
        As chamadas salvas neste dispositivo serão enviadas para o banco de dados na nuvem.
      </p>

      <div class="dialog-actions">
        <button mat-stroked-button type="button" (click)="onCancel()">Cancelar</button>
        <button mat-flat-button color="primary" type="button" (click)="onConfirm()">
          <mat-icon aria-hidden="true">check</mat-icon>
          Confirmar envio
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .attendance-send-confirm-dialog {
        width: min(380px, calc(100vw - 32px));
        box-sizing: border-box;
        padding: 20px 18px 16px;
        display: flex;
        flex-direction: column;
        gap: 18px;
        font-family: Arial, Helvetica, sans-serif;
      }

      .dialog-header {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .dialog-header .material-icons {
        font-size: 28px;
        color: #2e7d32;
      }

      .dialog-header h3 {
        margin: 0;
        font-size: 1.1rem;
        color: #212121;
      }

      .attendance-send-confirm-dialog p {
        margin: 0;
        color: #424242;
        line-height: 1.5;
      }

      .dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        flex-wrap: wrap;
      }
    `,
  ],
})
export class AttendanceSendConfirmDialogComponent {
  constructor(private dialogRef: MatDialogRef<AttendanceSendConfirmDialogComponent>) {}

  onConfirm(): void {
    this.dialogRef.close(true);
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}

@Component({
  selector: 'app-attendance-progress-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatProgressSpinnerModule, MatButtonModule],
  template: `
    <div class="attendance-progress-dialog" role="status" aria-live="polite">
      <div class="progress-header">
        <mat-progress-spinner diameter="42" strokeWidth="4" mode="indeterminate" aria-hidden="true"></mat-progress-spinner>
        <div>
          <h3>Enviando chamadas</h3>
          <p>{{ currentEntryLabel || 'Preparando envio...' }}</p>
        </div>
      </div>

      <div class="progress-meta">
        <span>{{ processed }}/{{ total }} concluídos</span>
        <strong>{{ sent }} enviadas</strong>
      </div>

      <div class="progress-bar" aria-label="Progresso do envio das chamadas">
        <div class="progress-fill" [style.width.%]="progressValue"></div>
      </div>

      <div class="progress-summary">
        <span>Registradas: {{ sent }}</span>
        <span>Falhas: {{ failed }}</span>
      </div>

      <div class="progress-list" *ngIf="sentEntries.length || failedEntries.length">
        <div class="progress-item success" *ngIf="sentEntries.length">
          <span class="dot"></span>
          <span>Registradas: {{ sentEntries.join(', ') }}</span>
        </div>
        <div class="progress-item danger" *ngIf="failedEntries.length">
          <span class="dot"></span>
          <span>Falhas: {{ failedEntries.join(', ') }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .attendance-progress-dialog {
        width: min(420px, calc(100vw - 32px));
        box-sizing: border-box;
        padding: 20px 18px 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        font-family: Arial, Helvetica, sans-serif;
      }

      .progress-header {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .progress-header h3 {
        margin: 0 0 4px;
        font-size: 1.15rem;
        color: #212121;
      }

      .progress-header p {
        margin: 0;
        color: #5f6368;
        font-size: 0.92rem;
      }

      .progress-meta,
      .progress-summary {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 0.92rem;
        color: #424242;
      }

      .progress-bar {
        height: 10px;
        background: #e0e0e0;
        border-radius: 999px;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #4caf50 0%, #2e7d32 100%);
        border-radius: inherit;
        transition: width 220ms ease;
      }

      .progress-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 0.85rem;
        color: #424242;
      }

      .progress-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        line-height: 1.4;
      }

      .progress-item.success .dot { background: #2e7d32; }
      .progress-item.danger .dot { background: #d32f2f; }

      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
        margin-top: 6px;
      }
    `,
  ],
})
export class AttendanceProgressDialogComponent {
  public total = 0;
  public processed = 0;
  public sent = 0;
  public failed = 0;
  public currentEntryLabel = 'Preparando envio...';
  public sentEntries: string[] = [];
  public failedEntries: string[] = [];

  constructor(private cdr: ChangeDetectorRef) {}

  public applyUpdate(update: {
    total: number;
    processed: number;
    sent: number;
    failed: number;
    currentEntryLabel: string;
    sentEntries: string[];
    failedEntries: string[];
  }): void {
    this.total = update.total;
    this.processed = update.processed;
    this.sent = update.sent;
    this.failed = update.failed;
    this.currentEntryLabel = update.currentEntryLabel || 'Processando...';
    this.sentEntries = update.sentEntries;
    this.failedEntries = update.failedEntries;
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  public get progressValue(): number {
    if (!this.total) {
      return 0;
    }

    return Math.min(100, (this.processed / this.total) * 100);
  }
}

@Component({
  selector: 'app-attendance-duplicate-warning-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="attendance-duplicate-warning-dialog">
      <div class="dialog-header">
        <span class="material-icons" aria-hidden="true">warning</span>
        <h3>Chamada já registrada</h3>
      </div>

      <p>
        Já existe uma chamada salva localmente para a sala <strong>{{ room }}</strong> na data <strong>{{ date }}</strong>.
      </p>

      <p class="dialog-subtext">
        Edite a chamada salva ou exclua antes de registrar outra para o mesmo período.
      </p>

      <div class="dialog-actions">
        <button mat-flat-button color="primary" type="button" (click)="onClose()">
          <mat-icon aria-hidden="true">check</mat-icon>
          Entendi
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .attendance-duplicate-warning-dialog {
        width: min(380px, calc(100vw - 32px));
        box-sizing: border-box;
        padding: 20px 18px 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        font-family: Arial, Helvetica, sans-serif;
      }

      .dialog-header {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .dialog-header .material-icons {
        font-size: 28px;
        color: #f59e0b;
      }

      .dialog-header h3 {
        margin: 0;
        font-size: 1.1rem;
        color: #212121;
      }

      .attendance-duplicate-warning-dialog p {
        margin: 0;
        color: #424242;
        line-height: 1.5;
      }

      .dialog-subtext {
        color: #5f6368;
        font-size: 0.92rem;
      }

      .dialog-actions {
        display: flex;
        justify-content: flex-end;
      }
    `,
  ],
})
export class AttendanceDuplicateWarningDialogComponent {
  public room = '';
  public date = '';

  constructor(private dialogRef: MatDialogRef<AttendanceDuplicateWarningDialogComponent>) {}

  onClose(): void {
    this.dialogRef.close();
  }
}
