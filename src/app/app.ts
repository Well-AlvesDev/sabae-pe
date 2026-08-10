import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MatProgressSpinnerModule],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class App {}
