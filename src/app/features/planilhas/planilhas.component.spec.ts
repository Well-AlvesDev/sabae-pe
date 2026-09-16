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
});