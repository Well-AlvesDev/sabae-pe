import { ChangeDetectorRef } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { PlanilhasComponent } from './planilhas.component';

describe('PlanilhasComponent', () => {
  it('preserves blank lines in the registration order and excludes unregistered students', () => {
    const component = new PlanilhasComponent({} as Router, {} as ChangeDetectorRef, {} as MatDialog);
    component.registrations = '3841517\n\n3678153\n9999999\n3688344\n3726760';

    const rows = [3841517, 3678153, 3688344, 3726760].map(registration => ({
      'MATRÍCULA': String(registration),
      NOME: `Aluno ${registration}`,
      TURMA: 'A',
    }));
    rows.push({ 'MATRÍCULA': '', NOME: 'Sem matrícula', TURMA: 'A' });

    const orderedRows = (component as any).orderRowsByRegistration(rows);

    expect(orderedRows.map((row: Record<string, string>) => row['MATRÍCULA'])).toEqual([
      '3841517',
      '',
      '3678153',
      '',
      '3688344',
      '3726760',
    ]);
  });

  it('creates benefit columns in the requested order and leaves missing values blank', () => {
    const component = new PlanilhasComponent({} as Router, {} as ChangeDetectorRef, {} as MatDialog);

    const row = (component as any).createReportRow({
      MAT: '123',
      NOME: 'Aluno',
      TURMA: 'A',
      TURNO: 'Manhã',
      STATUS: 'Matriculado',
      'PM-BF': 'sim, não informado',
    }, 'Janeiro');

    expect(['MATRÍCULA', 'NOME', 'TURMA', 'TURNO', 'STATUS', 'BOLSA FAMÍLIA', 'PÉ DE MEIA']).toEqual([
      'MATRÍCULA', 'NOME', 'TURMA', 'TURNO', 'STATUS', 'BOLSA FAMÍLIA', 'PÉ DE MEIA',
    ]);
    expect(row['BOLSA FAMÍLIA']).toBe('');
    expect(row['PÉ DE MEIA']).toBe('SIM');
    expect((component as any).createReportRow({ 'PM-BF': 'não, sim' }, 'Janeiro')['BOLSA FAMÍLIA']).toBe('SIM');
    expect((component as any).createReportRow({ 'PM-BF': 'não, não' }, 'Janeiro')['BOLSA FAMÍLIA']).toBe('NÃO');
    expect((component as any).createReportRow({ 'PM-BF': null }, 'Janeiro')['BOLSA FAMÍLIA']).toBe('');
  });
});