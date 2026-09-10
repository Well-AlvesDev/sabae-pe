import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export type AttendanceDay = {
  day: number;
  weekday: string;
  status: 'P' | 'FNJ' | 'FJ' | null;
};

export type StudentAttendanceDialogData = {
  name: string;
  room: string;
  registration: string;
  monthLabel: string;
  days: AttendanceDay[];
  present: number;
  unjustified: number;
  justified: number;
};

@Component({
  selector: 'app-aluno-attendance-dialog',
  imports: [MatDialogModule],
  template: `
    <section class="attendance-dialog" aria-labelledby="attendance-dialog-title">
      <header class="dialog-header">
        <div>
          <p class="dialog-eyebrow">Frequência mensal</p>
          <h2 id="attendance-dialog-title">{{ data.name }}</h2>
          <p class="dialog-subtitle">{{ data.room }}{{ data.registration ? ' • Matrícula ' + data.registration : '' }}</p>
        </div>
        <button class="dialog-close" type="button" aria-label="Fechar detalhes" mat-dialog-close>
          <span class="material-icons" aria-hidden="true">close</span>
        </button>
      </header>

      <div class="month-heading">
        <strong>{{ data.monthLabel }}</strong>
        <div class="summary" aria-label="Resumo da frequência">
          <span class="present">P: {{ data.present }}</span>
          <span class="unjustified">FNJ: {{ data.unjustified }}</span>
          <span class="justified">FJ: {{ data.justified }}</span>
        </div>
      </div>

      <div class="status-legend" aria-label="Legenda de frequência">
        <span><i class="status-dot present"></i> Presença</span>
        <span><i class="status-dot unjustified"></i> Falta não justificada</span>
        <span><i class="status-dot justified"></i> Falta justificada</span>
        <span><i class="status-dot empty"></i> Sem registro</span>
      </div>

      <div class="day-grid" role="list" [attr.aria-label]="'Frequência de ' + data.name + ' em ' + data.monthLabel">
        @for (item of data.days; track item.day) {
          <div class="day-cell" role="listitem" [class.present]="item.status === 'P'"
            [class.unjustified]="item.status === 'FNJ'" [class.justified]="item.status === 'FJ'"
            [attr.aria-label]="'Dia ' + item.day + ': ' + statusLabel(item.status)">
            <small class="weekday">{{ item.weekday }}</small>
            <strong>{{ item.day }}</strong>
            <small class="day-status">{{ item.status || '-' }}</small>
          </div>
        }
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .attendance-dialog { width: min(620px, calc(100vw - 32px)); padding: 22px; color: #263746; }
    .dialog-header, .month-heading, .summary, .status-legend { display: flex; align-items: center; }
    .dialog-header { justify-content: space-between; gap: 16px; }
    .dialog-eyebrow { margin: 0 0 4px; color: #3478c8; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    h2 { margin: 0; color: #0c365c; font-size: 1.35rem; line-height: 1.2; }
    .dialog-subtitle { margin: 5px 0 0; color: #718096; font-size: 0.82rem; }
    .dialog-close { display: inline-flex; width: 38px; height: 38px; align-items: center; justify-content: center; border: 0; border-radius: 50%; background: transparent; color: #64748b; cursor: pointer; }
    .dialog-close:hover { background: #edf3f9; color: #0f4d91; }
    .month-heading { justify-content: space-between; gap: 12px; margin-top: 22px; }
    .month-heading > strong { color: #0c365c; font-size: 1.05rem; text-transform: uppercase; }
    .summary { flex-wrap: wrap; gap: 10px; font-size: 0.78rem; }
    .summary .present { color: #16a34a; }
    .summary .unjustified { color: #dc2626; }
    .summary .justified { color: #2563eb; }
    .status-legend { flex-wrap: wrap; gap: 8px 14px; margin: 15px 0 18px; color: #64748b; font-size: 0.7rem; }
    .status-legend span { display: inline-flex; align-items: center; gap: 5px; }
    .status-dot { width: 9px; height: 9px; border-radius: 50%; background: #cbd5e1; }
    .status-dot.present { background: #16a34a; }
    .status-dot.unjustified { background: #dc2626; }
    .status-dot.justified { background: #2563eb; }
    .day-grid { display: grid; grid-template-columns: repeat(5, minmax(42px, 54px)); justify-content: start; gap: 9px; max-width: 306px; }
    .day-cell { display: flex; width: 54px; aspect-ratio: 1; flex-direction: column; align-items: center; justify-content: center; gap: 1px; border: 2px solid #cbd5e1; border-radius: 50%; background: #f1f3f5; color: #8993a0; }
    .day-cell strong { font-size: 0.9rem; line-height: 1; }
    .day-cell small { font-size: 0.58rem; font-weight: 700; line-height: 1; }
    .day-cell .weekday { text-transform: lowercase; }
    .day-cell .day-status { font-size: 0.56rem; }
    .day-cell.present { border-color: #16a34a; background: #16a34a; color: #fff; }
    .day-cell.unjustified { border-color: #dc2626; background: #dc2626; color: #fff; }
    .day-cell.justified { border-color: #2563eb; background: #2563eb; color: #fff; }
    @media (max-width: 480px) {
      .attendance-dialog { padding: 18px 14px; }
      .day-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; max-width: none; }
      .day-cell { width: 100%; min-width: 0; }
      .day-cell strong { font-size: 0.78rem; }
      .day-cell small { font-size: 0.5rem; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlunoAttendanceDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: StudentAttendanceDialogData,
  ) {}

  public statusLabel(status: AttendanceDay['status']): string {
    if (status === 'P') return 'presença';
    if (status === 'FNJ') return 'falta não justificada';
    if (status === 'FJ') return 'falta justificada';
    return 'sem registro';
  }
}
