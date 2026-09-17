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
import {
  ensureTbdaCache,
  getStudentFunctionRules,
  hydrateStudentFunctionRulesFromIndexedDb,
  getTbdaClassrooms,
  getTbdaShifts,
  insertStudent,
  removeStudentFunctionRule,
  saveStudentFunctionRule,
  updateStudentClassroom,
  updateStudentName,
  updateStudentShift,
  updateStudentStatus,
  type StudentAdministrativeStatus,
  type StudentFunctionRule,
} from '../../supabase';
import type { AttendanceDay } from './aluno-attendance.dialog';

export type StudentOperation =
  | 'Adicionar Aluno'
  | 'Alterar Status do Aluno'
  | 'Alterar Turma do Aluno'
  | 'Alterar Nome do Aluno'
  | 'Alterar turno'
  | 'Visualizar aluno'
  | 'Criar função'
  | 'Visualizar funções'
  | 'Excluir função';

export type StudentOverviewMonth = {
  month: number;
  label: string;
  days: AttendanceDay[];
  present: number;
  unjustified: number;
  justified: number;
};

export type StudentOverviewDialogData = {
  student: StudentSearchItem;
  months: StudentOverviewMonth[];
};

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
          <p class="dialog-eyebrow"
            [class.operation-alter]="data.operation.startsWith('Alterar')"
            [class.operation-add]="data.operation.startsWith('Adicionar')"
            [class.operation-create]="data.operation.startsWith('Criar função')"
            [class.operation-view]="data.operation.startsWith('Visualizar funções')"
            [class.operation-delete]="data.operation.startsWith('Excluir função')">
            {{ data.operation === 'Visualizar aluno' ? 'Visualizar aluno' : data.operation.startsWith('Criar função') || data.operation.startsWith('Visualizar funções') || data.operation.startsWith('Excluir função') ? 'Funções' : 'Operar aluno' }}
          </p>
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
      } @else if (data.operation === 'Criar função') {
        <form class="function-creation-form" (ngSubmit)="submitCreateFunction()">
          <mat-form-field appearance="outline">
            <mat-label>Nome da função</mat-label>
            <input matInput name="functionName" [(ngModel)]="functionRule.name" required />
          </mat-form-field>

          <div class="rule-row">
            <span class="rule-label">Se</span>
            <mat-form-field appearance="outline" class="rule-field">
              <mat-label>Condição</mat-label>
              <mat-select name="condition" [(ngModel)]="functionRule.condition">
                <mat-option value="Registrando chamada">Registrando chamada</mat-option>
              </mat-select>
            </mat-form-field>
          </div>

          <div class="rule-row">
            <span class="rule-label">Quando</span>
            <mat-form-field appearance="outline" class="rule-field">
              <mat-label>Evento</mat-label>
              <mat-select name="trigger" [(ngModel)]="functionRule.trigger">
                <mat-option value="Aluno justificou falta">Aluno justificou falta</mat-option>
              </mat-select>
            </mat-form-field>
          </div>

          @if (functionRule.trigger === 'Aluno justificou falta') {
            <mat-form-field class="search-field" appearance="outline">
              <mat-label>Pesquisar aluno</mat-label>
              <mat-icon matPrefix>search</mat-icon>
              <input matInput name="functionSearchTerm" [ngModel]="functionSearchTerm()" (ngModelChange)="setFunctionSearchTerm($event)"
                placeholder="Nome ou matrícula" autocomplete="off" />
              @if (functionSearchTerm()) {
                <button mat-icon-button matSuffix type="button" aria-label="Limpar pesquisa" (click)="setFunctionSearchTerm('')">
                  <mat-icon>close</mat-icon>
                </button>
              }
            </mat-form-field>

            @if (isLoading()) {
              <div class="dialog-state small-state">
                <mat-spinner diameter="26"></mat-spinner>
                <span>Carregando alunos...</span>
              </div>
            } @else if (hasError()) {
              <div class="dialog-state error-state small-state">
                <mat-icon>error_outline</mat-icon>
                <span>Não foi possível carregar os alunos.</span>
              </div>
            } @else if (functionFilteredStudents().length) {
              <div class="function-results" aria-label="Resultados da pesquisa de alunos">
                @for (student of functionFilteredStudents(); track student.registration + student.name) {
                  <button class="function-result" type="button" (click)="selectFunctionStudent(student)">
                    <span class="function-result-name">{{ student.name }}</span>
                    <span class="function-result-meta">
                      Matrícula: {{ student.registration || 'não informada' }}
                      @if (student.room) {
                        • Turma: {{ student.room }}
                      }
                    </span>
                  </button>
                }
              </div>
            } @else if (functionSearchTerm()) {
              <div class="dialog-state small-state">
                <mat-icon>person_search</mat-icon>
                <span>Nenhum aluno encontrado.</span>
              </div>
            } @else {
              <div class="dialog-state small-state">
                <mat-icon>person_search</mat-icon>
                <span>Digite para pesquisar por nome ou matrícula.</span>
              </div>
            }

            <mat-form-field appearance="outline">
              <mat-label>Matrícula do aluno</mat-label>
              <input matInput [ngModel]="functionSelectedStudent()?.registration ?? ''" name="selectedRegistration" readonly />
            </mat-form-field>
          }

          <div class="rule-row">
            <span class="rule-label">Então</span>
            <mat-form-field appearance="outline" class="rule-field">
              <mat-label>Ação</mat-label>
              <input matInput value="Justificar falta" name="resultAction" readonly />
            </mat-form-field>
          </div>

          <div class="date-fields">
            <mat-form-field appearance="outline">
              <mat-label>Início</mat-label>
              <input matInput type="date" name="startDate" [(ngModel)]="functionRule.startDate" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Até</mat-label>
              <input matInput type="date" name="endDate" [(ngModel)]="functionRule.endDate" />
            </mat-form-field>
          </div>

          <div class="function-actions">
            <button mat-button type="button" mat-dialog-close>Cancelar</button>
            <button class="insert-button" mat-flat-button type="submit">Salvar função</button>
          </div>
        </form>
      } @else if (data.operation === 'Visualizar funções') {
        <div class="function-list-view">
          <mat-form-field class="search-field" appearance="outline">
            <mat-label>Pesquisar função</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput name="functionListSearch" [ngModel]="functionListSearchTerm()" (ngModelChange)="setFunctionListSearchTerm($event)"
              placeholder="Nome da função ou aluno" autocomplete="off" />
          </mat-form-field>

          @if (isLoading()) {
            <div class="dialog-state small-state">
              <mat-spinner diameter="26"></mat-spinner>
              <span>Carregando funções...</span>
            </div>
          } @else if (hasError()) {
            <div class="dialog-state error-state small-state">
              <mat-icon>error_outline</mat-icon>
              <span>Não foi possível carregar as funções.</span>
            </div>
          } @else if (functionFilteredRules().length) {
            <div class="function-card-list" aria-label="Funções cadastradas">
              @for (rule of functionFilteredRules(); track rule.name + rule.savedAt) {
                @let isExpanded = selectedFunctionRule()?.name === rule.name && selectedFunctionRule()?.savedAt === rule.savedAt;
                <article class="function-card" [class.is-expanded]="isExpanded">
                  <button class="function-summary" type="button" (click)="toggleFunctionRule(rule)">
                    <div class="function-summary-content">
                      <span class="function-result-name">{{ rule.name }}</span>
                      <span class="function-result-meta">
                        {{ rule.studentName || 'Aluno não informado' }} - {{ formatDate(rule.startDate, 'Sem início') }} até {{ formatDate(rule.endDate, 'Sem fim') }}
                      </span>
                    </div>
                    <mat-icon>{{ isExpanded ? 'keyboard_arrow_up' : 'keyboard_arrow_down' }}</mat-icon>
                  </button>

                  @if (isExpanded) {
                    <div class="function-detail-card">
                      <p><strong>Se:</strong> {{ rule.condition }}</p>
                      <p><strong>Quando:</strong> {{ rule.trigger }}</p>
                      <p><strong>Então:</strong> {{ rule.action }}</p>
                      <p><strong>Aluno:</strong> {{ rule.studentName || 'Não informado' }}</p>
                      @if (rule.studentRegistration) {
                        <p><strong>Matrícula:</strong> {{ rule.studentRegistration }}</p>
                      }
                      @if (rule.studentRoom) {
                        <p><strong>Turma:</strong> {{ rule.studentRoom }}</p>
                      }
                      <p><strong>Período:</strong> {{ formatDate(rule.startDate, 'Sem início') }} até {{ formatDate(rule.endDate, 'Sem fim') }}</p>
                    </div>
                  }
                </article>
              }
            </div>
          } @else {
            <div class="dialog-state small-state">
              <mat-icon>playlist_add_check</mat-icon>
              <span>Nenhuma função encontrada.</span>
            </div>
          }
        </div>
      } @else if (data.operation === 'Excluir função') {
        <div class="function-list-view">
          <mat-form-field class="search-field" appearance="outline">
            <mat-label>Pesquisar função</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput name="functionListSearchDelete" [ngModel]="functionListSearchTerm()" (ngModelChange)="setFunctionListSearchTerm($event)"
              placeholder="Nome da função ou aluno" autocomplete="off" />
          </mat-form-field>

          @if (isLoading()) {
            <div class="dialog-state small-state">
              <mat-spinner diameter="26"></mat-spinner>
              <span>Carregando funções...</span>
            </div>
          } @else if (hasError()) {
            <div class="dialog-state error-state small-state">
              <mat-icon>error_outline</mat-icon>
              <span>Não foi possível carregar as funções.</span>
            </div>
          } @else if (functionFilteredRules().length) {
            <div class="function-card-list" aria-label="Lista de funções para excluir">
              @for (rule of functionFilteredRules(); track rule.name + rule.savedAt) {
                @let isExpanded = selectedFunctionRule()?.name === rule.name && selectedFunctionRule()?.savedAt === rule.savedAt;
                <article class="function-card" [class.is-expanded]="isExpanded">
                  <button class="function-summary" type="button" (click)="toggleFunctionRule(rule)">
                    <div class="function-summary-content">
                      <span class="function-result-name">{{ rule.name }}</span>
                      <span class="function-result-meta">
                        {{ rule.studentName || 'Aluno não informado' }} - {{ formatDate(rule.startDate, 'Sem início') }} até {{ formatDate(rule.endDate, 'Sem fim') }}
                      </span>
                    </div>
                    <mat-icon>{{ isExpanded ? 'keyboard_arrow_up' : 'keyboard_arrow_down' }}</mat-icon>
                  </button>

                  @if (isExpanded) {
                    <div class="function-detail-card">
                      <p><strong>Se:</strong> {{ rule.condition }}</p>
                      <p><strong>Quando:</strong> {{ rule.trigger }}</p>
                      <p><strong>Então:</strong> {{ rule.action }}</p>
                      <p><strong>Aluno:</strong> {{ rule.studentName || 'Não informado' }}</p>
                      @if (rule.studentRegistration) {
                        <p><strong>Matrícula:</strong> {{ rule.studentRegistration }}</p>
                      }
                      @if (rule.studentRoom) {
                        <p><strong>Turma:</strong> {{ rule.studentRoom }}</p>
                      }
                      <p><strong>Período:</strong> {{ formatDate(rule.startDate, 'Sem início') }} até {{ formatDate(rule.endDate, 'Sem fim') }}</p>

                      <button class="delete-function-button" type="button" (click)="deleteFunctionRule(rule)">
                        <mat-icon>delete</mat-icon>
                        Excluir
                      </button>
                    </div>
                  }
                </article>
              }
            </div>
          } @else {
            <div class="dialog-state small-state">
              <mat-icon>playlist_add_check</mat-icon>
              <span>Nenhuma função encontrada.</span>
            </div>
          }
        </div>
      } @else {
      <mat-form-field class="search-field" appearance="outline">
        <mat-label>Pesquisar aluno</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput name="searchTerm" [ngModel]="searchTerm()" (ngModelChange)="setSearchTerm($event)"
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
    .dialog-eyebrow.operation-alter { color: #e8b80a; }
    .dialog-eyebrow.operation-add { color: #34b447; }
    .dialog-eyebrow.operation-create { color: #34b447; }
    .dialog-eyebrow.operation-view { color: #e8b80a; }
    .dialog-eyebrow.operation-delete { color: #d92d20; }
    h2 { margin: 0; color: #0c365c; font-size: 1.3rem; line-height: 1.25; }
    .search-field { display: block; width: 100%; }
    .student-registration-form { display: flex; flex-direction: column; gap: 8px; }
    .student-registration-form mat-form-field { width: 100%; }
    .registration-help { margin: 0 0 12px; color: #64748b; font-size: 0.84rem; line-height: 1.4; }
    .registration-error { margin: 0 0 4px; color: #b42318; font-size: 0.85rem; }
    .function-creation-form { display: flex; flex-direction: column; gap: 12px; }
    .function-creation-form mat-form-field { width: 100%; }
    .rule-row { display: flex; align-items: center; gap: 12px; }
    .rule-label { min-width: 38px; color: #0c365c; font-size: 0.96rem; font-weight: 700; }
    .rule-field { flex: 1; }
    .function-results { display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto; padding: 0; border: 1px solid #dfeaf5; border-radius: 12px; background: #f7fafc; }
    .function-card-list { display: flex; flex-direction: column; gap: 10px; }
    .function-card { display: flex; flex-direction: column; border: 1px solid #dfeaf5; border-radius: 14px; background: #ffffff; overflow: hidden; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
    .function-card.is-expanded { border-color: #5f5f5f; box-shadow: 0 0 0 1px rgba(142, 202, 230, 0.2); }
    .function-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; padding: 14px 16px; border: 0; background: transparent; color: #263746; cursor: pointer; text-align: left; }
    .function-summary:hover, .function-summary:focus-visible { background: rgba(60, 60, 60, 0.03); }
    .function-summary-content { display: flex; flex: 1; flex-direction: column; gap: 2px; }
    .function-result-row { display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #e6edf4; }
    .function-result-row:last-child { border-bottom: 0; }
    .function-result { display: flex; flex: 1; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; padding: 10px 12px; border: 0; background: transparent; color: #263746; cursor: pointer; text-align: left; }
    .function-result:hover, .function-result:focus-visible { background: rgba(12, 54, 92, 0.06); }
    .function-result-name { font-weight: 700; }
    .function-result-meta { color: #383838; font-size: 0.8rem; }
    .delete-function-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; margin-right: 8px; padding: 8px 10px; border: 0; border-radius: 8px; background: #fee2e2; color: #b42318; cursor: pointer; font-weight: 700; }
    .delete-function-button mat-icon { font-size: 18px; }
    .function-list-view { display: flex; flex-direction: column; gap: 12px; }
    .function-detail-card { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px 16px; border-top: 1px solid #404040; background: #ffffff; }
    .function-detail-card p { margin: 0; color: #2a2a2a; font-size: 0.9rem; }
    .date-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .function-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    .small-state { min-height: 60px; }
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
  public readonly functionRule = {
    name: '',
    condition: 'Registrando chamada',
    trigger: 'Aluno justificou falta',
    startDate: '',
    endDate: '',
  };
  public readonly functionSearchTerm = signal('');
  public readonly functionSelectedStudent = signal<StudentSearchItem | null>(null);
  public readonly functionListSearchTerm = signal('');
  public readonly functionRules = signal<StudentFunctionRule[]>([]);
  public readonly selectedFunctionRule = signal<StudentFunctionRule | null>(null);
  public readonly functionFilteredStudents = computed(() => {
    const term = this.normalize(this.functionSearchTerm());
    if (!term) {
      return [];
    }

    return this.students().filter(student =>
      this.normalize(student.name).includes(term) || this.normalize(student.registration).includes(term),
    );
  });
  public readonly functionFilteredRules = computed(() => {
    const term = this.normalize(this.functionListSearchTerm());
    if (!term) {
      return this.functionRules();
    }

    return this.functionRules().filter(rule =>
      this.normalize(rule.name).includes(term)
      || this.normalize(rule.studentName).includes(term)
      || this.normalize(rule.studentRegistration).includes(term),
    );
  });
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
      this.dialogRef.afterClosed().subscribe(() => {
        this.dialog.open(StudentOperationSuccessDialogComponent, {
          data: {
            student: {
              name: this.newStudent.name.trim(),
              registration: this.newStudent.registration.trim(),
              room: this.newStudent.classroom.trim(),
              shift: this.newStudent.shift.trim(),
              status: 'Matriculado',
            },
            message: 'Aluno cadastrado com sucesso.',
          },
          autoFocus: false,
          maxWidth: 'calc(100vw - 32px)',
        });
      });
      this.dialogRef.close(true);
    } catch (error) {
      this.registrationError.set(error instanceof Error ? error.message : 'Não foi possível inserir o aluno.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  public async submitCreateFunction(): Promise<void> {
    if (!this.functionRule.name.trim()) {
      return;
    }

    const selectedStudent = this.functionSelectedStudent();
    if (this.functionRule.trigger === 'Aluno justificou falta' && !selectedStudent) {
      return;
    }

    const saved = await saveStudentFunctionRule({
      name: this.functionRule.name.trim(),
      condition: this.functionRule.condition,
      trigger: this.functionRule.trigger,
      action: 'Justificar falta',
      studentName: selectedStudent?.name ?? '',
      studentRegistration: selectedStudent?.registration ?? '',
      studentRoom: selectedStudent?.room ?? '',
      studentShift: selectedStudent?.shift ?? '',
      startDate: this.functionRule.startDate,
      endDate: this.functionRule.endDate,
      savedAt: Date.now(),
    });

    if (!saved) {
      return;
    }

    this.dialogRef.close(true);
  }

  public setFunctionSearchTerm(value: string): void {
    this.functionSearchTerm.set(value);

    if (!value.trim()) {
      this.functionSelectedStudent.set(null);
      return;
    }

    if (this.students().length === 0 && !this.isLoading()) {
      void this.loadStudents();
    }

    this.functionSelectedStudent.set(null);
  }

  public selectFunctionStudent(student: StudentSearchItem): void {
    this.functionSelectedStudent.set(student);
    this.functionSearchTerm.set(student.name);
  }

  public setFunctionListSearchTerm(value: string): void {
    this.functionListSearchTerm.set(value);
  }

  public selectFunctionRule(rule: StudentFunctionRule): void {
    this.selectedFunctionRule.set(rule);
  }

  public toggleFunctionRule(rule: StudentFunctionRule): void {
    const current = this.selectedFunctionRule();
    const isSelected = current?.name === rule.name && current?.savedAt === rule.savedAt;

    this.selectedFunctionRule.set(isSelected ? null : rule);
  }

  public async deleteFunctionRule(rule: StudentFunctionRule): Promise<void> {
    const removed = await removeStudentFunctionRule(rule.name);
    if (!removed) {
      return;
    }

    this.functionRules.set(getStudentFunctionRules());
    this.selectedFunctionRule.set(null);
  }

  public selectStudent(student: StudentSearchItem): void {
    if (this.data.operation === 'Visualizar aluno') {
      this.dialogRef.close();
      void this.openStudentOverview(student);
      return;
    }

    if (this.data.operation === 'Alterar Status do Aluno') {
      const dialogRef = this.dialog.open(StudentTransferStatusDialogComponent, {
        data: { student },
        autoFocus: false,
        maxWidth: 'calc(100vw - 32px)',
      });
      dialogRef.afterClosed().subscribe(result => this.dialogRef.close(result === true));
      return;
    }

    if (this.data.operation === 'Alterar Turma do Aluno') {
      const dialogRef = this.dialog.open(StudentClassroomDialogComponent, {
        data: { student, classrooms: this.classrooms() },
        autoFocus: false,
        maxWidth: 'calc(100vw - 32px)',
      });
      dialogRef.afterClosed().subscribe(result => this.dialogRef.close(result === true));
      return;
    }

    if (this.data.operation === 'Alterar Nome do Aluno') {
      const dialogRef = this.dialog.open(StudentNameDialogComponent, {
        data: { student },
        autoFocus: false,
        maxWidth: 'calc(100vw - 32px)',
      });
      dialogRef.afterClosed().subscribe(result => this.dialogRef.close(result === true));
      return;
    }

    if (this.data.operation === 'Alterar turno') {
      const dialogRef = this.dialog.open(StudentShiftDialogComponent, {
        data: { student, shifts: this.shifts() },
        autoFocus: false,
        maxWidth: 'calc(100vw - 32px)',
      });
      dialogRef.afterClosed().subscribe(result => this.dialogRef.close(result === true));
      return;
    }

    this.dialogRef.close(student);
  }

  public async openStudentOverview(student: StudentSearchItem): Promise<void> {
    try {
      const rows = await ensureTbdaCache();
      const row = rows.find(candidate =>
        this.getValue(candidate, 'NOME') === student.name
        && this.getValue(candidate, 'TURMA') === student.room
        && this.getValue(candidate, 'MAT', 'MATRICULA', 'MATRÍCULA') === student.registration,
      );

      if (!row) {
        return;
      }

      this.dialog.open(StudentOverviewDialogComponent, {
        data: {
          student,
          months: this.buildStudentOverviewMonths(row),
        },
        autoFocus: false,
        maxWidth: 'calc(100vw - 20px)',
        panelClass: 'student-overview-dialog-panel',
      });
    } catch {
      // Keep the operation dialog closed and silently ignore the preview failure.
    }
  }

  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: StudentOperationDialogData,
    private readonly dialogRef: MatDialogRef<StudentOperationDialogComponent>,
    private readonly dialog: MatDialog,
  ) {
    if (data.operation === 'Adicionar Aluno') {
      void this.loadStudentOptions();
    } else if (data.operation === 'Visualizar funções' || data.operation === 'Excluir função') {
      void this.loadFunctionRules();
    } else {
      void this.loadStudents();
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
    this.isLoading.set(true);
    this.hasError.set(false);

    try {
      const rows = await ensureTbdaCache();
      this.classrooms.set(getTbdaClassrooms(rows));
      this.shifts.set(getTbdaShifts(rows));
      this.students.set(rows
        .map(row => ({
          name: this.getValue(row, 'NOME'),
          registration: this.getValue(row, 'MAT', 'MATRICULA', 'MATRÍCULA'),
          room: this.getValue(row, 'TURMA'),
          shift: this.getValue(row, 'TURNO'),
          status: this.getStudentStatus(row),
        }))
        .filter((student): student is StudentSearchItem => Boolean(student.name)));
    } catch {
      this.hasError.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadFunctionRules(): Promise<void> {
    this.isLoading.set(true);
    this.hasError.set(false);

    try {
      await hydrateStudentFunctionRulesFromIndexedDb();
      const rules = getStudentFunctionRules();
      this.functionRules.set(rules);
      this.selectedFunctionRule.set(null);
    } catch {
      this.hasError.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  private buildStudentOverviewMonths(row: Record<string, unknown>): StudentOverviewMonth[] {
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const days = this.buildAttendanceDays(row, month);
      const present = days.filter(day => day.status === 'P').length;
      const unjustified = days.filter(day => day.status === 'FNJ').length;
      const justified = days.filter(day => day.status === 'FJ').length;

      return {
        month,
        label: monthNames[index],
        days,
        present,
        unjustified,
        justified,
      };
    });
  }

  private buildAttendanceDays(row: Record<string, unknown>, month: number): AttendanceDay[] {
    const year = new Date().getFullYear();
    const dayCount = new Date(year, month, 0).getDate();
    const weekdays = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

    return Array.from({ length: dayCount }, (_, index) => {
      const day = index + 1;
      const date = new Date(year, month - 1, day);

      if (date.getDay() === 0 || date.getDay() === 6) {
        return null;
      }

      const value = String(row[String(day)] ?? '').toUpperCase();
      const match = value.match(new RegExp(`\\b(P|FNJ|FJ):${month}\\b`));

      return {
        day,
        weekday: weekdays[date.getDay()],
        status: (match?.[1] as AttendanceDay['status']) || null,
      };
    }).filter((day): day is AttendanceDay => day !== null);
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

  public formatDate(value: string | null | undefined, fallback: string): string {
    if (!value) {
      return fallback;
    }

    const [year, month, day] = value.split('-');

    if (!year || !month || !day) {
      return value;
    }

    return `${day}/${month}/${year}`;
  }

  private getStudentStatus(row: Record<string, unknown>): StudentAdministrativeStatus {
    const status = this.normalize(this.getValue(row, 'STATUS'));
    return status === 'transferido' ? 'Transferido' : 'Matriculado';
  }
}

@Component({
  selector: 'app-student-overview-dialog',
  imports: [CommonModule, MatDialogModule],
  template: `
    <section class="student-overview-dialog" aria-labelledby="student-overview-dialog-title">
      <header class="dialog-header">
        <div>
          <p class="dialog-eyebrow">Aluno selecionado</p>
          <h2 id="student-overview-dialog-title">{{ data.student.name }}</h2>
          <p class="student-meta">
            {{ data.student.room || 'Turma não informada' }}
            @if (data.student.registration) {
              • Matrícula {{ data.student.registration }}
            }
          </p>
          @if (data.student.status) {
            <p class="student-meta">Status: {{ data.student.status }}</p>
          }
        </div>
        <button class="dialog-close" type="button" aria-label="Fechar detalhes" mat-dialog-close>
          <span class="material-icons" aria-hidden="true">close</span>
        </button>
      </header>

      <div class="overview-list" aria-label="Calendários de frequência do aluno">
        @for (month of data.months; track month.month) {
          <article class="month-card">
            <div class="month-heading">
              <strong>{{ month.label }}</strong>
              <div class="summary" aria-label="Resumo de presença do mês">
                <span class="present">P: {{ month.present }}</span>
                <span class="unjustified">FNJ: {{ month.unjustified }}</span>
                <span class="justified">FJ: {{ month.justified }}</span>
              </div>
            </div>

            <div class="status-legend" aria-label="Legenda de frequência">
              <span><i class="status-dot present"></i> Presença</span>
              <span><i class="status-dot unjustified"></i> Falta não justificada</span>
              <span><i class="status-dot justified"></i> Falta justificada</span>
              <span><i class="status-dot empty"></i> Sem registro</span>
            </div>

            <div class="day-grid" role="list" [attr.aria-label]="'Frequência de ' + data.student.name + ' em ' + month.label">
              @for (item of month.days; track item.day) {
                <div class="day-cell" role="listitem" [class.present]="item.status === 'P'"
                  [class.unjustified]="item.status === 'FNJ'" [class.justified]="item.status === 'FJ'"
                  [attr.aria-label]="'Dia ' + item.day + ': ' + statusLabel(item.status)">
                  <small class="weekday">{{ item.weekday }}</small>
                  <strong>{{ item.day }}</strong>
                  <small class="day-status">{{ item.status || '-' }}</small>
                </div>
              }
            </div>
          </article>
        }
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .student-overview-dialog { display: flex; width: min(960px, calc(100vw - 32px)); max-height: min(760px, calc(100vh - 32px)); box-sizing: border-box; flex-direction: column; padding: 22px; color: #263746; }
    .dialog-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
    .dialog-eyebrow { margin: 0 0 4px; color: #3478c8; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    h2 { margin: 0; color: #0c365c; font-size: 1.45rem; line-height: 1.2; }
    .student-meta { margin: 6px 0 0; color: #718096; font-size: 0.82rem; }
    .dialog-close { display: inline-flex; width: 38px; height: 38px; align-items: center; justify-content: center; border: 0; border-radius: 50%; background: transparent; color: #64748b; cursor: pointer; }
    .dialog-close:hover { background: #edf3f9; color: #0f4d91; }
    .overview-list { display: grid; gap: 18px; overflow-y: auto; padding-right: 6px; }
    .month-card { padding: 18px; border: 1px solid #dbe5ef; border-radius: 16px; background: #f8fbff; }
    .month-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .month-heading > strong { color: #0c365c; font-size: 1rem; text-transform: uppercase; }
    .summary { display: flex; flex-wrap: wrap; gap: 10px; font-size: 0.76rem; }
    .summary .present { color: #16a34a; }
    .summary .unjustified { color: #dc2626; }
    .summary .justified { color: #2563eb; }
    .status-legend { display: flex; flex-wrap: wrap; gap: 8px 14px; margin: 0 0 14px; color: #64748b; font-size: 0.7rem; }
    .status-legend span { display: inline-flex; align-items: center; gap: 5px; }
    .status-dot { width: 9px; height: 9px; border-radius: 50%; background: #cbd5e1; }
    .status-dot.present { background: #16a34a; }
    .status-dot.unjustified { background: #dc2626; }
    .status-dot.justified { background: #2563eb; }
    .status-dot.empty { background: #cbd5e1; }
    .day-grid { display: grid; grid-template-columns: repeat(5, minmax(42px, 54px)); justify-content: start; gap: 9px; }
    .day-cell { display: flex; width: 54px; aspect-ratio: 1; flex-direction: column; align-items: center; justify-content: center; gap: 1px; border: 2px solid #cbd5e1; border-radius: 50%; background: #f1f3f5; color: #8993a0; }
    .day-cell strong { font-size: 0.9rem; line-height: 1; }
    .day-cell small { font-size: 0.58rem; font-weight: 700; line-height: 1; }
    .day-cell .weekday { text-transform: lowercase; }
    .day-cell .day-status { font-size: 0.56rem; }
    .day-cell.present { border-color: #16a34a; background: #16a34a; color: #fff; }
    .day-cell.unjustified { border-color: #dc2626; background: #dc2626; color: #fff; }
    .day-cell.justified { border-color: #2563eb; background: #2563eb; color: #fff; }
    @media (max-width: 640px) {
      .student-overview-dialog { padding: 18px 14px; }
      .month-heading { flex-direction: column; align-items: flex-start; }
      .day-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
      .day-cell { width: 100%; min-width: 0; }
      .day-cell strong { font-size: 0.78rem; }
      .day-cell small { font-size: 0.5rem; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentOverviewDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: StudentOverviewDialogData,
  ) {}

  public statusLabel(status: AttendanceDay['status']): string {
    if (status === 'P') return 'presença';
    if (status === 'FNJ') return 'falta não justificada';
    if (status === 'FJ') return 'falta justificada';
    return 'sem registro';
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
  label?: string;
  value?: string;
  message?: string;
};

@Component({
  selector: 'app-student-operation-success-dialog',
  imports: [CommonModule, MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <section class="success-dialog" aria-labelledby="success-dialog-title">
      <mat-icon class="success-icon" aria-hidden="true">check_circle</mat-icon>
      <h2 id="success-dialog-title">Operação concluída</h2>
      <p>{{ data.message || data.student.name + ' agora está com ' + data.label + ' ' }}<strong>{{ data.message ? '' : data.value }}</strong>{{ data.message ? '' : '.' }}</p>
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
