import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { saveProfilePhoto } from './profile-photo-storage';

@Component({
  selector: 'app-profile-photo-editor-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatProgressSpinnerModule],
  template: `
    <div class="profile-photo-dialog">
      <div class="profile-photo-dialog__header">
        <h2>Editar foto de perfil</h2>
      </div>

      <div class="profile-photo-dialog__content">
        <div class="profile-photo-dialog__preview"
          [class.has-photo]="selectedPhoto"
          [class.is-dragging]="isDragging"
          (pointerdown)="onPointerDown($event)"
          (pointermove)="onPointerMove($event)"
          (pointerup)="onPointerUp($event)"
          (pointerleave)="onPointerUp($event)"
          (wheel)="onWheel($event)">
          <ng-container *ngIf="selectedPhoto; else previewFallback">
            <img [src]="selectedPhoto" alt="Foto de perfil atual" [ngStyle]="previewImageStyle" />
          </ng-container>
          <ng-template #previewFallback>
            <div class="profile-photo-dialog__fallback">{{ avatarInitial }}</div>
          </ng-template>
        </div>

        <label class="profile-photo-dialog__upload" for="profile-photo-input">
          <input id="profile-photo-input" type="file" accept="image/*" (change)="onFileSelected($event)" />
          Escolher imagem
        </label>

        <p class="profile-photo-dialog__hint">Arraste a imagem para ajustar a posição e use o scroll do mouse para ajustar o zoom.</p>
      </div>

      <div class="profile-photo-dialog__actions">
        <button mat-button type="button" (click)="close()" [disabled]="isSaving">
          Cancelar
        </button>
        <button mat-flat-button color="primary" type="button" (click)="save()" [disabled]="!selectedPhoto || isSaving">
          <span *ngIf="!isSaving">Salvar</span>
          <mat-progress-spinner *ngIf="isSaving" diameter="18" strokeWidth="3" mode="indeterminate" aria-hidden="true"></mat-progress-spinner>
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .profile-photo-dialog {
        padding: 20px;
        background: #fff;
        border-radius: 12px;
      }

      .profile-photo-dialog__header h2 {
        margin: 0 0 16px;
        font-size: 22px;
        color: #0c365c;
      }

      .profile-photo-dialog__content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }

      .profile-photo-dialog__preview {
        width: 140px;
        height: 140px;
        border-radius: 50%;
        overflow: hidden;
        border: 2px solid rgba(12, 54, 92, 0.18);
        background: #edf4ff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
        user-select: none;
        touch-action: none;
      }

      .profile-photo-dialog__preview.is-dragging {
        cursor: grabbing;
      }

      .profile-photo-dialog__preview img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        will-change: transform;
        background: #edf4ff;
      }

      .profile-photo-dialog__fallback {
        font-size: 40px;
        font-weight: 700;
        color: #0c365c;
      }

      .profile-photo-dialog__upload {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 180px;
        padding: 10px 16px;
        border-radius: 999px;
        background: #0c365c;
        color: #fff;
        font-weight: 600;
        cursor: pointer;
      }

      .profile-photo-dialog__upload input {
        display: none;
      }

      .profile-photo-dialog__hint {
        margin: 0;
        font-size: 12px;
        color: #6b7280;
        text-align: center;
      }

      .profile-photo-dialog__actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
      }
    `,
  ],
})
export class ProfilePhotoEditorDialogComponent {
  public selectedPhoto: string | null = null;
  public isSaving = false;
  public avatarInitial = 'U';
  public scale = 1;
  public positionX = 0;
  public positionY = 0;
  public isDragging = false;
  private selectedFile: File | null = null;
  private objectUrl: string | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartPositionX = 0;
  private dragStartPositionY = 0;

  constructor(
    private readonly dialogRef: MatDialogRef<ProfilePhotoEditorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: {
      currentPhoto?: string | null;
      userName: string;
      scale?: number;
      positionX?: number;
      positionY?: number;
    },
  ) {
    this.selectedPhoto = data.currentPhoto ?? null;
    this.avatarInitial = this.getAvatarInitial(data.userName);
    this.scale = typeof data.scale === 'number' ? data.scale : 1;
    this.positionX = typeof data.positionX === 'number' ? data.positionX : 0;
    this.positionY = typeof data.positionY === 'number' ? data.positionY : 0;
  }

  public onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    this.selectedFile = file;

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }

    this.objectUrl = URL.createObjectURL(file);
    this.selectedPhoto = this.objectUrl;
  }

  public async save(): Promise<void> {
    if (!this.selectedPhoto) {
      return;
    }

    this.isSaving = true;

    try {
      const photoDataUrl = await this.toDataUrl(this.selectedFile ?? this.selectedPhoto);
      await saveProfilePhoto(photoDataUrl, {
        scale: this.scale,
        positionX: this.positionX,
        positionY: this.positionY,
      });
      this.dialogRef.close({
        dataUrl: photoDataUrl,
        scale: this.scale,
        positionX: this.positionX,
        positionY: this.positionY,
      });
    } finally {
      this.isSaving = false;
      this.cleanupObjectUrl();
    }
  }

  public close(): void {
    this.cleanupObjectUrl();
    this.dialogRef.close(null);
  }

  public onPointerDown(event: PointerEvent): void {
    if (!this.selectedPhoto) {
      return;
    }

    this.isDragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragStartPositionX = this.positionX;
    this.dragStartPositionY = this.positionY;

    const target = event.currentTarget as HTMLDivElement | null;
    target?.setPointerCapture(event.pointerId);
  }

  public onPointerMove(event: PointerEvent): void {
    if (!this.isDragging) {
      return;
    }

    const deltaX = event.clientX - this.dragStartX;
    const deltaY = event.clientY - this.dragStartY;

    this.positionX = this.dragStartPositionX + deltaX;
    this.positionY = this.dragStartPositionY + deltaY;
  }

  public onPointerUp(event?: PointerEvent): void {
    this.isDragging = false;

    if (event) {
      const target = event.currentTarget as HTMLDivElement | null;
      target?.releasePointerCapture(event.pointerId);
    }
  }

  public onWheel(event: WheelEvent): void {
    event.preventDefault();

    const nextScale = this.scale + (event.deltaY < 0 ? 0.08 : -0.08);
    this.scale = Math.min(2.5, Math.max(1, Number(nextScale.toFixed(2))));
  }

  public get previewImageStyle(): Record<string, string> {
    return {
      transform: `translate(${this.positionX}px, ${this.positionY}px) scale(${this.scale})`,
      'transform-origin': 'center',
    };
  }

  private getAvatarInitial(name: string): string {
    return String(name || 'U').trim().charAt(0).toUpperCase() || 'U';
  }

  private async toDataUrl(source: File | string): Promise<string> {
    if (typeof source === 'string') {
      if (source.startsWith('data:')) {
        return source;
      }

      if (source.startsWith('blob:')) {
        const response = await fetch(source);
        const blob = await response.blob();
        return await this.fileToDataUrl(blob);
      }

      return source;
    }

    return this.fileToDataUrl(source);
  }

  private fileToDataUrl(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(typeof reader.result === 'string' ? reader.result : '');
      };
      reader.onerror = () => reject(reader.error ?? new Error('Não foi possível transformar a imagem.'));
      reader.readAsDataURL(file);
    });
  }

  private cleanupObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
