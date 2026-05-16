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
    title: '👋 Добро пожаловать в FluxPilot!',
    description: 'Здесь вы создадите свой первый workflow для A/B-тестов. Пройдёмся по основным элементам интерфейса?',
    position: 'center',
    icon: '🎯'
  },
  {
    id: 'palette',
    title: 'Палитра нод',
    description: 'Слева находится палитра с типами нод. Перетащите ноду на холст или кликните для быстрого добавления.',
    highlightElement: '.palette-panel',
    position: 'right',
    icon: '📥'
  },
  {
    id: 'canvas',
    title: 'Холст',
    description: 'В центре — холст, где вы собираете пайплайн. Соединяйте ноды линиями: нажмите на точку у одной ноды и перетащите к другой.',
    highlightElement: '.canvas-wrapper',
    position: 'center',
    icon: '🎨'
  },
  {
    id: 'inspector',
    title: 'Настройки ноды',
    description: 'Справа — панель настроек выбранной ноды. Здесь можно указать URL, метод, параметры и другие настройки.',
    highlightElement: '.inspector-panel',
    position: 'left',
    icon: '⚙'
  },
  {
    id: 'run',
    title: 'Запуск workflow',
    description: 'Вверху справа — кнопки запуска. "Тест-запуск" проверит одну ноду, "Симуляция" создаст трафик из 100/500/1000 пользователей.',
    highlightElement: '.header-actions',
    position: 'bottom',
    icon: '▶'
  },
  {
    id: 'results',
    title: 'Результаты',
    description: 'Внизу — панель результатов. Здесь отображаются логи выполнения, метрики конверсии и статистика A/B-теста.',
    highlightElement: '.run-panel',
    position: 'top',
    icon: '📊'
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
            <div class="tour-icon">{{ step.icon }}</div>
            
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
              {{ currentStepIndex() === steps().length - 1 ? 'Завершить 🎉' : 'Далее' }}
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
      background: white;
      border-radius: 16px;
      padding: 24px;
      max-width: 520px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
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
      color: #0f172a;
    }

    .tour-description {
      margin: 0;
      font-size: 14px;
      line-height: 1.6;
      color: #475569;
      max-width: 480px;
    }

    .tour-highlight-hint {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      font-size: 13px;
      color: #0369a1;
    }

    .hint-badge {
      background: #0ea5e9;
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
      border-top: 1px solid #e2e8f0;
    }

    .tour-progress {
      display: flex;
      gap: 6px;
    }

    .progress-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #e2e8f0;
      transition: all 0.2s;
    }

    .progress-dot.active {
      background: #6366f1;
      transform: scale(1.2);
    }

    .progress-dot.completed {
      background: #22c55e;
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
      background: #6366f1;
      color: white;
    }

    button.primary:hover {
      background: #4f46e5;
    }

    button.ghost {
      background: transparent;
      border: 1px solid #e2e8f0;
    }

    button.ghost:hover {
      background: #f1f5f9;
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
