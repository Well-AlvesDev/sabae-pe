import { ChangeDetectorRef } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ChamadaComponent } from './chamada.component';

describe('ChamadaComponent', () => {
  let component: ChamadaComponent;

  beforeEach(() => {
    component = new ChamadaComponent({} as Router, {} as ChangeDetectorRef, {} as MatDialog);
    component.selectedMonth = 'Agosto';
    component.selectedDay = '31';
  });

  it('should show the selected date in the attendance modal subtitle instead of the series', () => {
    expect(component.getAttendanceModalDateLabel()).toBe('31/08');
  });

  it('should identify the edit mode title and orange header styling for saved attendance updates', () => {
    component.isEditingAttendance = true;

    expect(component.getAttendanceModalTitle()).toBe('Editar chamada');
  });
});
