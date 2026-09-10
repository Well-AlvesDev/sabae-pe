import { ChangeDetectionStrategy, Component, Inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ensureTbdaCache, getTbdaClassrooms, getTbdaShifts, insertStudent, updateStudentClassroom, updateStudentName, updateStudentShift, updateStudentStatus, type StudentAdministrativeStatus } from '../../supabase';

export type StudentOperation =
  | 'Adicionar Aluno'
  | 'Alterar Status do Aluno'
  | 'Alterar Turma do Aluno'
  | 'Alterar Nome do Aluno'
  | 'Alterar turno';

type StudentSearchItem = {
  name: string;
  registration: string;
  room: string;
  shift: string;
  status: StudentAdministrativeStatus;
};

export type StudentOperationDialogData = {
  operation: StudentOperation;
};

@Component({
  selector: 'app-student-operation-dialog',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  template: `
    <section class="operation-dialog" aria-labelledby="operation-dialog-title">
      <header class="dialog-header">
        <div>
          <p class="dialog-eyebrow">Operar aluno</p>
          <h2 id="operation-dialog-title">{{ data.operation }}</h2>
        </div>
        <button mat-icon-button type="button" mat-dialog-close aria-label="Fechar">
          <mat-icon>close</mat-icon>
        </button>
      </header>

      @if (data.operation === 'Adicionar Aluno') {
        <p class="registration-help">
          O preenchimento de todos os campos é obrigatório. Ao cadastrar, o aluno será registrado no sistema e os dados
          serão atualizados automaticamente.
        </p>
        <form class="student-registration-form" (ngSubmit)="submitNewStudent()">
          <mat-form-field appearance="outline">
            <mat-label>Nome</mat-label>
            <input matInput name="name" [(ngModel)]="newStudent.name" autocomplete="name" required />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Matrícula</mat-label>
            <input matInput name="registration" [(ngModel)]="newStudent.registration" inputmode="numeric" required />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Turma</mat-label>
            <mat-select name="classroom" [(ngModel)]="newStudent.classroom" required>
              <mat-option value="" disabled>Selecione a turma</mat-option>
              @for (classroom of classrooms(); track classroom) {
                <mat-option [value]="classroom">{{ classroom }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Turno</mat-label>
            <mat-select name="shift" [(ngModel)]="newStudent.shift" required>
              <mat-option value="" disabled>Selecione o turno</mat-option>
              @for (shift of shifts(); track shift) {
                <mat-option [value]="shift">{{ shift }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          @if (registrationError()) {
            <p class="registration-error" role="alert">{{ registrationError() }}</p>
          }
          <button class="insert-button" mat-flat-button type="submit" [disabled]="isSubmitting()">
            @if (isSubmitting()) {
              <mat-spinner diameter="20" aria-label="Inserindo aluno"></mat-spinner>
            } @else {
            Cadastrar Aluno
            }
          </button>
        </form>
      } @else {
      <mat-form-field class="search-field" appearance="outline">
        <mat-label>Pesquisar aluno</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [ngModel]="searchTerm()" (ngModelChange)="setSearchTerm($event)"
          placeholder="Nome ou matrícula" autocomplete="off" />
        @if (searchTerm()) {
          <button mat-icon-button matSuffix type="button" aria-label="Limpar pesquisa" (click)="setSearchTerm('')">
            <mat-icon>close</mat-icon>
          </button>
        }
      </mat-form-field>

      @if (isLoading()) {
        <div class="dialog-state">
          <mat-spinner diameter="30"></mat-spinner>
          <span>Carregando alunos...</span>
        </div>
      } @else if (hasError()) {
        <div class="dialog-state error-state">
          <mat-icon>error_outline</mat-icon>
          <span>Não foi possível carregar os alunos.</span>
        </div>
      } @else if (!filteredStudents().length) {
        <div class="dialog-state">
          <mat-icon>person_search</mat-icon>
          <span>Nenhum aluno encontrado.</span>
        </div>
      } @else {
        <mat-list class="student-results" aria-label="Resultados da pesquisa">
          @for (student of paginatedStudents(); track student.registration + student.name) {
            <mat-list-item class="student-result" (click)="selectStudent(student)" role="button">
              <mat-icon matListItemIcon>person</mat-icon>
              <span matListItemTitle>{{ student.name }}</span>
              <span matListItemLine>Matrícula: {{ student.registration || 'não informada' }}</span>
              @if (student.room) {
                <span matListItemLine>Turma: {{ student.room }}</span>
              }
            </mat-list-item>
          }
        </mat-list>
        @if (totalPages() > 1) {
          <nav class="pagination" aria-label="Paginação dos alunos">
            <button mat-icon-button type="button" aria-label="Página anterior"
              [disabled]="currentPage() === 1" (click)="previousPage()">
              <mat-icon>chevron_left</mat-icon>
            </button>
            <span aria-live="polite">Página {{ currentPage() }} de {{ totalPages() }}</span>
            <button mat-icon-button type="button" aria-label="Próxima página"
              [disabled]="currentPage() === totalPages()" (click)="nextPage()">
              <mat-icon>chevron_right</mat-icon>
            </button>
          </nav>
        }
      }
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .operation-dialog { display: flex; width: min(560px, calc(100vw - 32px)); height: min(560px, calc(100vh - 32px)); box-sizing: border-box; flex-direction: column; padding: 22px; color: #263746; }
    .dialog-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
    .dialog-eyebrow { margin: 0 0 4px; color: #34b447; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    h2 { margin: 0; color: #0c365c; font-size: 1.3rem; line-height: 1.25; }
    .search-field { display: block; width: 100%; }
    .student-registration-form { display: flex; flex-direction: column; gap: 8px; }
    .student-registration-form mat-form-field { width: 100%; }
    .registration-help { margin: 0 0 12px; color: #64748b; font-size: 0.84rem; line-height: 1.4; }
    .registration-error { margin: 0 0 4px; color: #b42318; font-size: 0.85rem; }
    .insert-button { align-self: flex-end; min-width: 104px; min-height: 42px; background: #34b447 !important; color: #fff !important; }
    .insert-button:hover:not(:disabled) { background: #278d36 !important; }
    .insert-button:disabled { background: #8bc991 !important; color: #f4fff5 !important; }
    .dialog-state { display: flex; min-height: 0; flex: 1; align-items: center; justify-content: center; gap: 10px; color: #64748b; font-size: 0.9rem; text-align: center; }
    .dialog-state mat-icon { color: #64748b; }
    .error-state { color: #b42318; }
    .error-state mat-icon { color: #b42318; }
    .student-results { min-height: 0; flex: 1; overflow-y: auto; padding: 0; }
    .student-result { border-bottom: 1px solid #e6edf4; cursor: pointer; }
    .student-result:last-child { border-bottom: 0; }
    .student-result:hover, .student-result:focus-visible { background: #f5f9fd; }
    .pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding-top: 10px; color: #526579; font-size: 0.85rem; }
    @media (max-width: 480px) { .operation-dialog { padding: 18px 14px; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentOperationDialogComponent {
  public readonly searchTerm = signal('');
  public readonly isLoading = signal(true);
  public readonly hasError = signal(false);
  public readonly students = signal<StudentSearchItem[]>([]);
  public readonly classrooms = signal<string[]>([]);
  public readonly shifts = signal<string[]>([]);
  public readonly isSubmitting = signal(false);
  public readonly registrationError = signal('');
  public readonly newStudent = { name: '', registration: '', classroom: '', shift: '' };
  public readonly currentPage = signal(1);
  public readonly pageSize = 25;
  public readonly filteredStudents = computed(() => {
    const term = this.normalize(this.searchTerm());
    if (!term) {
      return this.students();
    }
    return this.students().filter(student =>
      this.normalize(student.name).includes(term) || this.normalize(student.registration).includes(term),
    );
  });
  public readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredStudents().length / this.pageSize)));
  public readonly paginatedStudents = computed(() => {
    const startIndex = (this.currentPage() - 1) * this.pageSize;
    return this.filteredStudents().slice(startIndex, startIndex + this.pageSize);
  });

  public setSearchTerm(value: string): void {
    this.searchTerm.set(value);
    this.currentPage.set(1);
  }

  public previousPage(): void {
    this.currentPage.update(page => Math.max(1, page - 1));
  }

  public nextPage(): void {
    this.currentPage.update(page => Math.min(this.totalPages(), page + 1));
  }

  public async submitNewStudent(): Promise<void> {
    this.registrationError.set('');
    if (Object.values(this.newStudent).some(value => !value.trim())) {
      this.registrationError.set('Preencha nome, matrícula, turma e turno.');
      return;
    }

    this.isSubmitting.set(true);
    try {
      await insertStudent({
        name: this.newStudent.name,
        registration: this.newStudent.registration,
        classroom: this.newStudent.classroom,
        shift: this.newStudent.shift,
      });
      this.dialogRef.close(true);
    } catch (error) {
      this.registrationError.set(error instanceof Error ? error.message : 'Não foi possível inserir o aluno.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  public selectStudent(student: StudentSearchItem): void {
    if (this.data.operation === 'Alterar Status do Aluno') {
      this.dialog.open(StudentTransferStatusDialogComponent, {
        data: { student },
        autoFocus: false,
        maxWidth: 'calc(100vw - 32px)',
      });
      this.dialogRef.close();
      return;
    }

    if (this.data.operation === 'Alterar Turma do Aluno') {
      this.dialog.open(StudentClassroomDialogComponent, {
        data: { student, classrooms: this.classrooms() },
        autoFocus: false,
        maxWidth: 'calc(100vw - 32px)',
      });
      this.dialogRef.close();
      return;
    }

    if (this.data.operation === 'Alterar Nome do Aluno') {
      this.dialog.open(StudentNameDialogComponent, {
        data: { student },
        autoFocus: false,
        maxWidth: 'calc(100vw - 32px)',
      });
      this.dialogRef.close();
      return;
    }

    if (this.data.operation === 'Alterar turno') {
      this.dialog.open(StudentShiftDialogComponent, {
        data: { student, shifts: this.shifts() },
        autoFocus: false,
        maxWidth: 'calc(100vw - 32px)',
      });
      this.dialogRef.close();
      return;
    }

    this.dialogRef.close(student);
  }

  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: StudentOperationDialogData,
    private readonly dialogRef: MatDialogRef<StudentOperationDialogComponent>,
    private readonly dialog: MatDialog,
  ) {
    if (data.operation !== 'Adicionar Aluno') {
      void this.loadStudents();
    } else {
      void this.loadStudentOptions();
    }
  }

  private async loadStudentOptions(): Promise<void> {
    try {
      const rows = await ensureTbdaCache();
      this.classrooms.set(getTbdaClassrooms(rows));
      this.shifts.set(getTbdaShifts(rows));
    } catch {
      this.registrationError.set('Não foi possível carregar as opções de turma e turno.');
    }
  }

  private async loadStudents(): Promise<void> {
    try {
      const rows = await ensureTbdaCache();
      this.classrooms.set(getTbdaClassrooms(rows));
      this.shifts.set(getTbdaShifts(rows));
      this.students.set(rows.map(row => ({
        name: this.getValue(row, 'NOME'),
        registration: this.getValue(row, 'MAT', 'MATRICULA', 'MATRÍCULA'),
        room: this.getValue(row, 'TURMA'),
        shift: this.getValue(row, 'TURNO'),
        status: this.getStudentStatus(row),
      })).filter(student => student.name));
    } catch {
      this.hasError.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  private getValue(row: Record<string, unknown>, ...keys: string[]): string {
    for (const key of keys) {
      const value = row[key] ?? row[key.toUpperCase()] ?? row[key.toLowerCase()];
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
    return '';
  }

  private normalize(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
  }

  private getStudentStatus(row: Record<string, unknown>): StudentAdministrativeStatus {
    const status = this.normalize(this.getValue(row, 'STATUS'));
    return status === 'transferido' ? 'Transferido' : 'Matriculado';
  }
}

type StudentTransferStatusDialogData = {
  student: StudentSearchItem;
};

@Component({
  selector: 'app-student-transfer-status-dialog',
  imports: [CommonModule, FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatProgressSpinnerModule, MatSelectModule],
  template: `
    <section class="status-dialog" aria-labelledby="status-dialog-title">
      <header class="status-dialog-header">
        <div>
          <p class="dialog-eyebrow">Atribuir status para:</p>
          <h2 id="status-dialog-title">{{ data.student.name }}</h2>
          <p class="student-meta">Matrícula: {{ data.student.registration || 'não informada' }}</p>
          @if (data.student.room) {
            <p class="student-meta">Turma: {{ data.student.room }}</p>
          }
        </div>
        <button mat-icon-button type="button" mat-dialog-close aria-label="Fechar">
          <mat-icon>close</mat-icon>
        </button>
      </header>

      <mat-form-field class="status-field" appearance="outline">
        <mat-label>Novo status</mat-label>
        <mat-select [(ngModel)]="status">
          <mat-option value="Transferido">Transferido</mat-option>
          <mat-option value="Matriculado">Matriculado</mat-option>
        </mat-select>
      </mat-form-field>

      @if (errorMessage()) {
        <p class="error-message" role="alert"><mat-icon>error_outline</mat-icon>{{ errorMessage() }}</p>
      }

      <footer class="status-actions">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button class="execute-button" mat-flat-button type="button" (click)="execute()" [disabled]="isSaving()">
          @if (isSaving()) { <mat-spinner diameter="18"></mat-spinner> }
          @else { <mat-icon>play_arrow</mat-icon> }
          Executar
        </button>
      </footer>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .status-dialog { width: min(430px, calc(100vw - 32px)); padding: 20px; color: #263746; }
    .status-dialog-header, .status-actions, .error-message { display: flex; align-items: center; }
    .status-dialog-header { align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 18px; }
    .dialog-eyebrow { margin: 0 0 4px; color: #f2b705; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    h2 { margin: 0; color: #0c365c; font-size: 1.15rem; line-height: 1.25; }
    .student-meta { margin: 5px 0 0; color: #718096; font-size: 0.82rem; }
    .status-field { display: block; width: 100%; }
    .error-message { gap: 7px; margin: 0 0 12px; color: #b42318; font-size: 0.82rem; }
    .error-message mat-icon { font-size: 19px; }
    .status-actions { justify-content: flex-end; gap: 8px; margin-top: 8px; }
    .status-actions button { display: inline-flex; align-items: center; gap: 6px; }
    .execute-button { background: #f2b705 !important; color: #263746 !important; }
    .execute-button:hover:not(:disabled) { background: #d99f00 !important; }
    .execute-button:disabled { background: #f6d978 !important; color: #6b7280 !important; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentTransferStatusDialogComponent {
  public status: StudentAdministrativeStatus;
  public readonly isSaving = signal(false);
  public readonly errorMessage = signal('');

  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: StudentTransferStatusDialogData,
    private readonly dialogRef: MatDialogRef<StudentTransferStatusDialogComponent>,
    private readonly dialog: MatDialog,
  ) {
    this.status = data.student.status;
  }

  public async execute(): Promise<void> {
    this.isSaving.set(true);
    this.errorMessage.set('');
    try {
      await updateStudentStatus(this.data.student.registration, this.data.student.name, this.status);
      this.dialogRef.afterClosed().subscribe(() => {
        this.dialog.open(StudentOperationSuccessDialogComponent, {
          data: { student: this.data.student, label: 'status', value: this.status },
          autoFocus: false,
          maxWidth: 'calc(100vw - 32px)',
        });
      });
      this.dialogRef.close(true);
    } catch {
      this.errorMessage.set('Não foi possível atualizar o status.');
    } finally {
      this.isSaving.set(false);
    }
  }
}

type StudentClassroomDialogData = {
  student: StudentSearchItem;
  classrooms: string[];
};

type StudentShiftDialogData = {
  student: StudentSearchItem;
  shifts: string[];
};

type StudentNameDialogData = {
  student: StudentSearchItem;
};

@Component({
  selector: 'app-student-name-dialog',
  imports: [CommonModule, FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule],
  template: `
    <section class="status-dialog" aria-labelledby="name-dialog-title">
      <header class="status-dialog-header">
        <div>
          <p class="dialog-eyebrow">Atribuir nome para:</p>
          <h2 id="name-dialog-title">{{ data.student.name }}</h2>
          <p class="student-meta">Matrícula: {{ data.student.registration || 'não informada' }}</p>
          @if (data.student.room) {
            <p class="student-meta">Turma: {{ data.student.room }}</p>
          }
        </div>
        <button mat-icon-button type="button" mat-dialog-close aria-label="Fechar">
          <mat-icon>close</mat-icon>
        </button>
      </header>

      <mat-form-field class="status-field" appearance="outline">
        <mat-label>Nome do aluno</mat-label>
        <input matInput [(ngModel)]="newName" autocomplete="off" />
      </mat-form-field>

      @if (errorMessage()) {
        <p class="error-message" role="alert"><mat-icon>error_outline</mat-icon>{{ errorMessage() }}</p>
      }

      <footer class="status-actions">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button class="execute-button" mat-flat-button type="button" (click)="execute()" [disabled]="isSaving() || !newName.trim()">
          @if (isSaving()) { <mat-spinner diameter="18"></mat-spinner> }
          @else { <mat-icon>play_arrow</mat-icon> }
          Executar
        </button>
      </footer>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .status-dialog { width: min(430px, calc(100vw - 32px)); padding: 20px; color: #263746; }
    .status-dialog-header, .status-actions, .error-message { display: flex; align-items: center; }
    .status-dialog-header { align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 18px; }
    .dialog-eyebrow { margin: 0 0 4px; color: #f2b705; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    h2 { margin: 0; color: #0c365c; font-size: 1.15rem; line-height: 1.25; }
    .student-meta { margin: 5px 0 0; color: #718096; font-size: 0.82rem; }
    .status-field { display: block; width: 100%; }
    .error-message { gap: 7px; margin: 0 0 12px; color: #b42318; font-size: 0.82rem; }
    .error-message mat-icon { font-size: 19px; }
    .status-actions { justify-content: flex-end; gap: 8px; margin-top: 8px; }
    .status-actions button { display: inline-flex; align-items: center; gap: 6px; }
    .execute-button { background: #f2b705 !important; color: #263746 !important; }
    .execute-button:hover:not(:disabled) { background: #d99f00 !important; }
    .execute-button:disabled { background: #f6d978 !important; color: #6b7280 !important; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentNameDialogComponent {
  public newName: string;
  public readonly isSaving = signal(false);
  public readonly errorMessage = signal('');

  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: StudentNameDialogData,
    private readonly dialogRef: MatDialogRef<StudentNameDialogComponent>,
    private readonly dialog: MatDialog,
  ) {
    this.newName = data.student.name;
  }

  public async execute(): Promise<void> {
    const normalizedName = this.newName.trim();
    if (!normalizedName) {
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');
    try {
      await updateStudentName(this.data.student.registration, this.data.student.name, normalizedName);
      this.dialogRef.afterClosed().subscribe(() => {
        this.dialog.open(StudentOperationSuccessDialogComponent, {
          data: { student: { ...this.data.student, name: normalizedName }, label: 'nome', value: normalizedName },
          autoFocus: false,
          maxWidth: 'calc(100vw - 32px)',
        });
      });
      this.dialogRef.close(true);
    } catch {
      this.errorMessage.set('Não foi possível atualizar o nome.');
    } finally {
      this.isSaving.set(false);
    }
  }
}

@Component({
  selector: 'app-student-classroom-dialog',
  imports: [CommonModule, FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatProgressSpinnerModule, MatSelectModule],
  template: `
    <section class="status-dialog" aria-labelledby="classroom-dialog-title">
      <header class="status-dialog-header">
        <div>
          <p class="dialog-eyebrow">Atribuir turma para:</p>
          <h2 id="classroom-dialog-title">{{ data.student.name }}</h2>
          <p class="student-meta">Matrícula: {{ data.student.registration || 'não informada' }}</p>
        </div>
        <button mat-icon-button type="button" mat-dialog-close aria-label="Fechar">
          <mat-icon>close</mat-icon>
        </button>
      </header>

      <mat-form-field class="status-field" appearance="outline">
        <mat-label>Nova turma</mat-label>
        <mat-select [(ngModel)]="classroom">
          @for (availableClassroom of data.classrooms; track availableClassroom) {
            <mat-option [value]="availableClassroom">{{ availableClassroom }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      @if (errorMessage()) {
        <p class="error-message" role="alert"><mat-icon>error_outline</mat-icon>{{ errorMessage() }}</p>
      }

      <footer class="status-actions">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button class="execute-button" mat-flat-button type="button" (click)="execute()" [disabled]="isSaving() || !classroom">
          @if (isSaving()) { <mat-spinner diameter="18"></mat-spinner> }
          @else { <mat-icon>play_arrow</mat-icon> }
          Executar
        </button>
      </footer>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .status-dialog { width: min(430px, calc(100vw - 32px)); padding: 20px; color: #263746; }
    .status-dialog-header, .status-actions, .error-message { display: flex; align-items: center; }
    .status-dialog-header { align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 18px; }
    .dialog-eyebrow { margin: 0 0 4px; color: #f2b705; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    h2 { margin: 0; color: #0c365c; font-size: 1.15rem; line-height: 1.25; }
    .student-meta { margin: 5px 0 0; color: #718096; font-size: 0.82rem; }
    .status-field { display: block; width: 100%; }
    .error-message { gap: 7px; margin: 0 0 12px; color: #b42318; font-size: 0.82rem; }
    .error-message mat-icon { font-size: 19px; }
    .status-actions { justify-content: flex-end; gap: 8px; margin-top: 8px; }
    .status-actions button { display: inline-flex; align-items: center; gap: 6px; }
    .execute-button { background: #f2b705 !important; color: #263746 !important; }
    .execute-button:hover:not(:disabled) { background: #d99f00 !important; }
    .execute-button:disabled { background: #f6d978 !important; color: #6b7280 !important; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentClassroomDialogComponent {
  public classroom: string;
  public readonly isSaving = signal(false);
  public readonly errorMessage = signal('');

  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: StudentClassroomDialogData,
    private readonly dialogRef: MatDialogRef<StudentClassroomDialogComponent>,
    private readonly dialog: MatDialog,
  ) {
    this.classroom = data.student.room || data.classrooms[0] || '';
  }

  public async execute(): Promise<void> {
    this.isSaving.set(true);
    this.errorMessage.set('');
    try {
      await updateStudentClassroom(this.data.student.registration, this.data.student.name, this.classroom);
      this.dialogRef.afterClosed().subscribe(() => {
        this.dialog.open(StudentOperationSuccessDialogComponent, {
          data: { student: this.data.student, label: 'turma', value: this.classroom },
          autoFocus: false,
          maxWidth: 'calc(100vw - 32px)',
        });
      });
      this.dialogRef.close(true);
    } catch {
      this.errorMessage.set('Não foi possível atualizar a turma.');
    } finally {
      this.isSaving.set(false);
    }
  }
}

@Component({
  selector: 'app-student-shift-dialog',
  imports: [CommonModule, FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatProgressSpinnerModule, MatSelectModule],
  template: `
    <section class="status-dialog" aria-labelledby="shift-dialog-title">
      <header class="status-dialog-header">
        <div>
          <p class="dialog-eyebrow">Atribuir turno para:</p>
          <h2 id="shift-dialog-title">{{ data.student.name }}</h2>
          <p class="student-meta">Matrícula: {{ data.student.registration || 'não informada' }}</p>
          @if (data.student.room) {
            <p class="student-meta">Turma: {{ data.student.room }}</p>
          }
        </div>
        <button mat-icon-button type="button" mat-dialog-close aria-label="Fechar">
          <mat-icon>close</mat-icon>
        </button>
      </header>

      <mat-form-field class="status-field" appearance="outline">
        <mat-label>Novo turno</mat-label>
        <mat-select [(ngModel)]="shift">
          @for (availableShift of data.shifts; track availableShift) {
            <mat-option [value]="availableShift">{{ availableShift }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      @if (errorMessage()) {
        <p class="error-message" role="alert"><mat-icon>error_outline</mat-icon>{{ errorMessage() }}</p>
      }

      <footer class="status-actions">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button class="execute-button" mat-flat-button type="button" (click)="execute()" [disabled]="isSaving() || !shift">
          @if (isSaving()) { <mat-spinner diameter="18"></mat-spinner> }
          @else { <mat-icon>play_arrow</mat-icon> }
          Executar
        </button>
      </footer>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .status-dialog { width: min(430px, calc(100vw - 32px)); padding: 20px; color: #263746; }
    .status-dialog-header, .status-actions, .error-message { display: flex; align-items: center; }
    .status-dialog-header { align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 18px; }
    .dialog-eyebrow { margin: 0 0 4px; color: #f2b705; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    h2 { margin: 0; color: #0c365c; font-size: 1.15rem; line-height: 1.25; }
    .student-meta { margin: 5px 0 0; color: #718096; font-size: 0.82rem; }
    .status-field { display: block; width: 100%; }
    .error-message { gap: 7px; margin: 0 0 12px; color: #b42318; font-size: 0.82rem; }
    .error-message mat-icon { font-size: 19px; }
    .status-actions { justify-content: flex-end; gap: 8px; margin-top: 8px; }
    .status-actions button { display: inline-flex; align-items: center; gap: 6px; }
    .execute-button { background: #f2b705 !important; color: #263746 !important; }
    .execute-button:hover:not(:disabled) { background: #d99f00 !important; }
    .execute-button:disabled { background: #f6d978 !important; color: #6b7280 !important; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentShiftDialogComponent {
  public shift: string;
  public readonly isSaving = signal(false);
  public readonly errorMessage = signal('');

  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: StudentShiftDialogData,
    private readonly dialogRef: MatDialogRef<StudentShiftDialogComponent>,
    private readonly dialog: MatDialog,
  ) {
    this.shift = data.student.shift || data.shifts[0] || '';
  }

  public async execute(): Promise<void> {
    if (!this.shift) {
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');
    try {
      await updateStudentShift(this.data.student.registration, this.data.student.name, this.shift);
      this.dialogRef.afterClosed().subscribe(() => {
        this.dialog.open(StudentOperationSuccessDialogComponent, {
          data: { student: { ...this.data.student, shift: this.shift }, label: 'turno', value: this.shift },
          autoFocus: false,
          maxWidth: 'calc(100vw - 32px)',
        });
      });
      this.dialogRef.close(true);
    } catch {
      this.errorMessage.set('Não foi possível atualizar o turno.');
    } finally {
      this.isSaving.set(false);
    }
  }
}

type StudentOperationSuccessDialogData = {
  student: StudentSearchItem;
  label: string;
  value: string;
};

@Component({
  selector: 'app-student-operation-success-dialog',
  imports: [CommonModule, MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <section class="success-dialog" aria-labelledby="success-dialog-title">
      <mat-icon class="success-icon" aria-hidden="true">check_circle</mat-icon>
      <h2 id="success-dialog-title">Operação concluída</h2>
      <p>{{ data.student.name }} agora está com {{ data.label }} <strong>{{ data.value }}</strong>.</p>
      <button mat-flat-button class="success-button" type="button" mat-dialog-close>Entendido!</button>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .success-dialog { width: min(360px, calc(100vw - 32px)); padding: 28px 22px 22px; color: #263746; text-align: center; }
    .success-icon { width: 52px; height: 52px; color: #16a34a; font-size: 52px; line-height: 52px; }
    h2 { margin: 14px 0 8px; color: #0c365c; font-size: 1.25rem; }
    p { margin: 0 0 22px; color: #64748b; font-size: 0.92rem; line-height: 1.45; }
    .success-button { background: #16a34a !important; color: #fff !important; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentOperationSuccessDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public readonly data: StudentOperationSuccessDialogData) {}
}
