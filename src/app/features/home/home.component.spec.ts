import { ChangeDetectorRef, NgZone } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { getAttendanceCache, getAttendanceRegistrationPayloads, saveAttendanceCacheEntry } from '../../supabase';
import { HomeComponent } from './home.component';

describe('HomeComponent performance status', () => {
  let component: HomeComponent;

  beforeEach(() => {
    component = new HomeComponent({} as Router, {} as ChangeDetectorRef, {} as NgZone, {} as MatDialog);
  });

  it('should mark good performance for scores of 8 or higher', () => {
    component['setPerformanceState'](8);

    expect(component.performanceLabel).toBe('Bom desempenho');
    expect(component.performanceClass).toBe('good');
  });

  it('should mark medium performance for scores between 7 and 7.99', () => {
    component['setPerformanceState'](7.5);

    expect(component.performanceLabel).toBe('Médio desempenho');
    expect(component.performanceClass).toBe('warning');
  });

  it('should mark low performance for scores below 7', () => {
    component['setPerformanceState'](6.9);

    expect(component.performanceLabel).toBe('Baixo desempenho');
    expect(component.performanceClass).toBe('danger');
  });

  it('should show a loading placeholder while summary data is loading', () => {
    expect(component.getSummaryDisplayValue(12, true)).toBe('Calculando...');
    expect(component.getSummaryDisplayValue(12, true, '%')).toBe('Calculando...');
    expect(component.getSummaryDisplayValue(12, false)).toBe('12');
    expect(component.getSummaryDisplayValue(12, false, '%')).toBe('12%');
  });

  it('should aggregate attendance by turma using the TURMA column', () => {
    const rows = [
      { TURMA: 'A', 1: 'P', 2: 'FNJ', 3: 'FJ' },
      { TURMA: 'A', 4: 'P', 5: 'P' },
      { TURMA: 'B', 1: 'FNJ', 2: 'FJ', 3: 'P' },
    ];

    const result = component['buildClassroomSummary'](rows as Record<string, unknown>[]);

    expect(result).toEqual([
      { name: 'A', total: 5, present: 3, fnj: 1, fj: 1, presentPct: 60, fnjPct: 20, fjPct: 20 },
      { name: 'B', total: 3, present: 1, fnj: 1, fj: 1, presentPct: 33, fnjPct: 33, fjPct: 33 },
    ]);
  });

  it('should persist each attendance register in its own cache row', () => {
    localStorage.clear();

    saveAttendanceCacheEntry({
      room: 'Sala 1',
      month: 'Agosto',
      day: '30',
      savedAt: 1,
      students: [{ name: 'Ana', registration: '123', status: 'P' }],
    });

    saveAttendanceCacheEntry({
      room: 'Sala 2',
      month: 'Agosto',
      day: '31',
      savedAt: 2,
      students: [{ name: 'Bruno', registration: '456', status: 'FNJ' }],
    });

    expect(getAttendanceCache()).toHaveLength(2);
    expect(getAttendanceCache()[0]).toEqual(expect.objectContaining({ room: 'Sala 1', day: '30' }));
    expect(getAttendanceCache()[1]).toEqual(expect.objectContaining({ room: 'Sala 2', day: '31' }));
  });

  it('should convert cached calls into registrar_chamada_nativa payloads', () => {
    localStorage.clear();

    saveAttendanceCacheEntry({
      room: '1A',
      month: 'Agosto',
      day: '18',
      savedAt: 10,
      students: [
        { name: 'Ana Paula', registration: '1001', status: 'P' },
        { name: 'Bruno Silva', registration: '1002', status: 'FJ' },
      ],
    });

    expect(getAttendanceRegistrationPayloads()).toEqual([
      { savedAt: 10, dia: 18, mes: 8, mat: '1001', nome: 'Ana Paula', presenca: 'P' },
      { savedAt: 10, dia: 18, mes: 8, mat: '1002', nome: 'Bruno Silva', presenca: 'FJ' },
    ]);
  });
});
