import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { HomeComponent } from './home.component';

describe('HomeComponent performance status', () => {
  let component: HomeComponent;

  beforeEach(() => {
    component = new HomeComponent({} as Router, {} as ChangeDetectorRef);
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
});
