import { Component, HostListener, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (open()) {
      <div class="modal-backdrop" (click)="close.emit()">
        <div class="modal-card" [style.width]="wide() ? 'min(960px,95vw)' : 'min(700px, 90vw)'" (click)="$event.stopPropagation()">
          <header>
            <h2>{{ title() }}</h2>
            <button class="ghost" (click)="close.emit()" title="Close">
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
          </header>
          <div class="modal-content">
            <ng-content></ng-content>
          </div>
          @if (showFooter()) {
            <footer>
              <ng-content select="[footer]"></ng-content>
            </footer>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: radial-gradient(ellipse at center, rgba(38, 24, 12, 0.55) 0%, rgba(8, 6, 4, 0.85) 75%);
      backdrop-filter: blur(6px) saturate(120%);
      -webkit-backdrop-filter: blur(6px) saturate(120%);
      display: grid;
      place-items: center;
      padding: 20px;
      z-index: 100;
    }

    .modal-card {
      background: var(--panel);
      border-radius: 16px;
      padding: 20px;
      max-height: 90vh;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    header h2 {
      margin: 0;
    }

    footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
    }

    .icon {
      display: block;
      color: inherit;
      vertical-align: middle;
    }
  `]
})
export class ModalComponent {
  open = input<boolean>(false);
  title = input<string>('');
  wide = input<boolean>(false);
  showFooter = input<boolean>(false);
  close = output<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) {
      this.close.emit();
    }
  }
}
