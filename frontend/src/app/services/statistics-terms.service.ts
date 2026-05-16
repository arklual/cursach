import { Injectable } from '@angular/core';

/**
 * Термины с пояснениями для разных режимов отображения
 */
export interface StatTerm {
  key: string;
  simple: string;      // Для базового режима
  expert: string;      // Для экспертного
  description: string; // Пояснение для тултипа
  formula?: string;    // Формула (для экспертов)
  interpretation?: string; // Как интерпретировать
}

export const STAT_TERMS: Record<string, StatTerm> = {
  conversion: {
    key: 'conversion',
    simple: 'Конверсия',
    expert: 'p̂ (sample proportion)',
    description: 'Доля пользователей, выполнивших целевое действие',
    formula: 'p̂ = k / N',
    interpretation: 'Каждый N-й пользователь совершил покупку'
  },
  ci95: {
    key: 'ci95',
    simple: 'Доверительный интервал',
    expert: 'CI95% (Confidence Interval)',
    description: 'Диапазон, где с вероятностью 95% находится истинная конверсия',
    formula: 'CI = p̂ ± 1.96·√(p̂(1-p̂)/N)',
    interpretation: 'Мы на 95% уверены, что реальная конверсия в этом диапазоне'
  },
  pValue: {
    key: 'pValue',
    simple: 'Значимость',
    expert: 'p-value',
    description: 'Вероятность, что разница случайна. < 0.05 — разница реальна',
    formula: 'p = 2(1 - Φ(|z|))',
    interpretation: 'p < 0.05 означает статистически значимую разницу'
  },
  variance: {
    key: 'variance',
    simple: 'Разброс',
    expert: 'Var(p̂) (Variance)',
    description: 'Мера разброса значений конверсии',
    formula: 'Var = p̂(1-p̂)/N',
    interpretation: 'Чем меньше, тем стабильнее результат'
  },
  delta: {
    key: 'delta',
    simple: 'Разница',
    expert: 'Δ (Delta)',
    description: 'Разница конверсий между вариантами A и B',
    formula: 'Δ = p̂_B - p̂_A',
    interpretation: 'На сколько процентных пунктов вариант B лучше A'
  },
  power: {
    key: 'power',
    simple: 'Мощность',
    expert: 'Statistical Power (1-β)',
    description: 'Вероятность обнаружить эффект, если он есть',
    formula: 'Power = 1 - β',
    interpretation: 'Мощность 80% = 80% шанс найти разницу при её наличии'
  },
  sampleSize: {
    key: 'sampleSize',
    simple: 'Размер выборки',
    expert: 'N (Sample Size)',
    description: 'Количество пользователей в каждой группе',
    formula: 'n ≈ ((z₁₋α/₂ + z₁₋β)² · p(1-p)) / d²',
    interpretation: 'Минимум пользователей для надёжного результата'
  },
  trafficAllocation: {
    key: 'trafficAllocation',
    simple: 'Распределение трафика',
    expert: 'Traffic Allocation',
    description: 'Сколько процентов пользователей увидят каждый вариант',
    interpretation: 'Сумма должна быть 100%'
  },
  randomization: {
    key: 'randomization',
    simple: 'Метод распределения',
    expert: 'Randomization Mode',
    description: 'Как определять, кто в какой вариант попадёт',
    interpretation: 'Hashed даёт более стабильные результаты'
  }
};

/**
 * Режим отображения терминов
 */
export type TermMode = 'simple' | 'expert';

@Injectable({ providedIn: 'root' })
export class StatisticsTermsService {
  private mode: TermMode = 'simple';

  /**
   * Переключение режима
   */
  setMode(newMode: TermMode): void {
    this.mode = newMode;
  }

  /**
   * Получение текущего режима
   */
  getMode(): TermMode {
    return this.mode;
  }

  /**
   * Получение термина для текущего режима
   */
  getTerm(key: string): string {
    const term = STAT_TERMS[key];
    if (!term) return key;
    return this.mode === 'simple' ? term.simple : term.expert;
  }

  /**
   * Получение всех данных термина
   */
  getTermData(key: string): StatTerm | undefined {
    return STAT_TERMS[key];
  }

  /**
   * Форматирование значения с пояснением
   */
  formatValue(key: string, value: number | number[] | string): string {
    const term = STAT_TERMS[key];
    if (!term) return String(value);

    if (typeof value === 'number') {
      // Проценты для конверсий и дельт
      if (['conversion', 'delta', 'pValue'].includes(key)) {
        const percent = value * 100;
        return `${percent.toFixed(1)}%`;
      }
    }
    
    // Доверительный интервал (массив)
    if (key === 'ci95' && Array.isArray(value)) {
      const [low, high] = value;
      return `${(low * 100).toFixed(0)}% – ${(high * 100).toFixed(0)}%`;
    }

    return String(value);
  }

  /**
   * Получение пояснения для тултипа
   */
  getTooltip(key: string): string {
    const term = STAT_TERMS[key];
    if (!term) return '';
    
    let tooltip = term.description;
    if (term.formula && this.mode === 'expert') {
      tooltip += `\n\nФормула: ${term.formula}`;
    }
    if (term.interpretation) {
      tooltip += `\n\n${term.interpretation}`;
    }
    
    return tooltip;
  }

  /**
   * Проверка статистической значимости
   */
  isSignificant(pValue: number, alpha: number = 0.05): boolean {
    return pValue < alpha;
  }

  /**
   * Рекомендация по результату
   */
  getRecommendation(delta: number, pValue: number): string {
    if (pValue >= 0.05) {
      return 'Разница не статистически значима. Продолжите тест.';
    }
    
    if (delta > 0) {
      return 'Вариант B лучше. Рекомендуется rollout.';
    } else {
      return 'Вариант A лучше. Оставьте контрольный вариант.';
    }
  }
}
