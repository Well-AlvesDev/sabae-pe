import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LayoutRefreshService {
  private readonly refreshSubject = new Subject<void>();
  public readonly refresh$ = this.refreshSubject.asObservable();

  public requestRefresh(): void {
    this.refreshSubject.next();
  }
}
