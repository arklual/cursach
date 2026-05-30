import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Шаг тура
 */
interface TourStep {
  id: string;
  title: string;
  description: string;
  highlightElement?: string; // CSS selector
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  icon?: string;
  action?: () => void;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Добро пожаловать',
    description: 'Здесь вы создадите свой первый workflow для A/B-тестов. Пройдёмся по основным элементам интерфейса?',
    position: 'center',
    icon: 'welcome'
  },
  {
    id: 'palette',
    title: 'Палитра нод',
    description: 'Слева находится палитра с типами нод. Перетащите ноду на холст или кликните для быстрого добавления.',
    highlightElement: '.palette-panel',
    position: 'right',
    icon: 'palette'
  },
  {
    id: 'canvas',
    title: 'Холст',
    description: 'В центре — холст, где вы собираете пайплайн. Соединяйте ноды линиями: нажмите на точку у одной ноды и перетащите к другой.',
    highlightElement: '.canvas-wrapper',
    position: 'center',
    icon: 'canvas'
  },
  {
    id: 'inspector',
    title: 'Настройки ноды',
    description: 'Справа — панель настроек выбранной ноды. Здесь можно указать URL, метод, параметры и другие настройки.',
    highlightElement: '.inspector-panel',
    position: 'left',
    icon: 'settings'
  },
  {
    id: 'run',
    title: 'Запуск workflow',
    description: 'Вверху справа — кнопки запуска. "Тест-запуск" проверит одну ноду, "Симуляция" создаст трафик из 100/500/1000 пользователей.',
    highlightElement: '.header-actions',
    position: 'bottom',
    icon: 'play_arrow'
  },
  {
    id: 'results',
    title: 'История запусков',
    description: 'Внизу — панель запусков. Здесь отображаются логи выполнения и вход/выход каждой ноды.',
    highlightElement: '.run-panel',
    position: 'top',
    icon: 'analytics'
  },
  {
    id: 'analytics',
    title: 'A/B-аналитика',
    description: 'Вкладка «Аналитика» показывает конверсии вариантов, доверительные интервалы и статистически значимый лучший вариант.',
    highlightElement: '.analytics-panel',
    position: 'top',
    icon: 'analytics'
  }
];

@Component({
  selector: 'app-onboarding-tour',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tour-overlay" [class.show]="currentStepIndex() >= 0">
      <div class="tour-modal">
        @if (currentStep(); as step) {
          <div class="tour-content">
            <div class="tour-icon">
              @switch (step.icon) {
                @case ('welcome') {
                  <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                  </svg>
                }
                @case ('palette') {
                  <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                    <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                  </svg>
                }
                @case ('canvas') {
                  <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                    <path d="M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H4V5h16v14z"/>
                  </svg>
                }
                @case ('settings') {
                  <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                  </svg>
                }
                @case ('play_arrow') {
                  <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                }
                @case ('analytics') {
                  <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
                  </svg>
                }
              }
            </div>
            
            <h3 class="tour-title">{{ step.title }}</h3>
            
            <p class="tour-description">{{ step.description }}</p>
            
            @if (step.highlightElement) {
              <div class="tour-highlight-hint">
                <span class="hint-badge">Подсветка</span>
                <span>Обратите внимание на эту область</span>
              </div>
            }
          </div>
          
          <div class="tour-footer">
            <button 
              class="ghost" 
              (click)="skip()"
              [disabled]="currentStepIndex() === 0">
              {{ currentStepIndex() === 0 ? 'Пропустить' : 'Назад' }}
            </button>
            
            <div class="tour-progress">
              @for (step of steps(); track step.id; let i = $index) {
                <span 
                  class="progress-dot"
                  [class.active]="i === currentStepIndex()"
                  [class.completed]="i < currentStepIndex()">
                </span>
              }
            </div>
            
            <button
              class="primary"
              (click)="next()">
              @if (currentStepIndex() === steps().length - 1) {
                <span>Завершить</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2.5"
                     stroke-linecap="round" stroke-linejoin="round"
                     aria-hidden="true">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              } @else {
                <span>Далее</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round"
                     aria-hidden="true">
                  <path d="M5 12h14"/>
                  <path d="m12 5 7 7-7 7"/>
                </svg>
              }
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .tour-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.3s;
    }

    .tour-overlay.show {
      display: flex;
      opacity: 1;
    }

    .tour-modal {
      background: var(--panel);
      border-radius: 16px;
      padding: 24px;
      max-width: 520px;
      width: 90%;
      box-shadow: var(--shadow-xl);
      border: 1px solid var(--border);
    }

    .tour-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 16px;
      padding: 8px;
    }

    .tour-icon {
      font-size: 48px;
      line-height: 1;
      margin-bottom: 8px;
    }

    .tour-title {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: var(--fg-primary);
    }

    .tour-description {
      margin: 0;
      font-size: 14px;
      line-height: 1.6;
      color: var(--fg-secondary);
      max-width: 480px;
    }

    .tour-highlight-hint {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--accent-glow);
      border: 1px solid var(--accent);
      border-radius: 8px;
      font-size: 13px;
      color: var(--accent);
    }

    .hint-badge {
      background: var(--accent);
      color: white;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .tour-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      width: 100%;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
    }

    .tour-progress {
      display: flex;
      gap: 6px;
    }

    .progress-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--border);
      transition: all 0.2s;
    }

    .progress-dot.active {
      background: var(--accent);
      transform: scale(1.2);
    }

    .progress-dot.completed {
      background: var(--success);
    }

    button {
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    button.primary {
      background: var(--accent);
      color: white;
    }

    button.primary:hover {
      background: var(--accent-hover);
    }

    button.ghost {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg-primary);
    }

    button.ghost:hover {
      background: var(--panel-hover);
    }
  `]
})
export class OnboardingTourComponent {
  currentStepIndex = signal<number>(-1);
  
  readonly steps = signal<TourStep[]>(TOUR_STEPS);
  
  tourComplete = output<void>();
  tourSkip = output<void>();

  currentStep = signal<TourStep | null>(null);

  /**
   * Запуск тура
   */
  start(): void {
    this.currentStepIndex.set(0);
    this.updateCurrentStep();
  }

  /**
   * Переход к следующему шагу
   */
  next(): void {
    const currentIndex = this.currentStepIndex();
    if (currentIndex >= this.steps().length - 1) {
      this.complete();
      return;
    }
    
    this.currentStepIndex.set(currentIndex + 1);
    this.updateCurrentStep();
  }

  /**
   * Переход к предыдущему шагу
   */
  prev(): void {
    const currentIndex = this.currentStepIndex();
    if (currentIndex > 0) {
      this.currentStepIndex.set(currentIndex - 1);
      this.updateCurrentStep();
    }
  }

  /**
   * Пропуск тура
   */
  skip(): void {
    const currentIndex = this.currentStepIndex();
    if (currentIndex === 0) {
      this.currentStepIndex.set(-1);
      this.tourSkip.emit();
    } else {
      this.prev();
    }
  }

  /**
   * Завершение тура
   */
  complete(): void {
    this.currentStepIndex.set(-1);
    this.tourComplete.emit();
    
    // Сохраняем, что пользователь прошёл тур
    localStorage.setItem('fluxpilot_onboarding_completed', 'true');
  }

  /**
   * Закрытие
   */
  close(): void {
    this.currentStepIndex.set(-1);
  }

  /**
   * Обновление текущего шага
   */
  private updateCurrentStep(): void {
    const index = this.currentStepIndex();
    if (index >= 0 && index < this.steps().length) {
      this.currentStep.set(this.steps()[index]);
    }
  }

  /**
   * Проверка, проходил ли пользователь тур
   */
  static hasCompleted(): boolean {
    return localStorage.getItem('fluxpilot_onboarding_completed') === 'true';
  }

  /**
   * Сброс прогресса тура (для тестирования)
   */
  static reset(): void {
    localStorage.removeItem('fluxpilot_onboarding_completed');
  }
}
