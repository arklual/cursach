import { Component, input, output } from '@angular/core';
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
            <button class="ghost" (click)="close.emit()">✕</button>
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
      background: rgba(15, 23, 42, 0.45);
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
  `]
})
export class ModalComponent {
  open = input<boolean>(false);
  title = input<string>('');
  wide = input<boolean>(false);
  showFooter = input<boolean>(false);
  close = output<void>();
}
