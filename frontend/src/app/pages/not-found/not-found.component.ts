import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="nf">
      <h1>404</h1>
      <p>Страница не найдена.</p>
      <a routerLink="/">Вернуться на главную</a>
    </section>
  `,
  styles: [`
    .nf { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 80px 16px; color: var(--fg-secondary); }
    .nf h1 { font-size: 64px; margin: 0; color: var(--fg-primary); }
    .nf p { margin: 0; font-size: 16px; }
    .nf a { color: var(--accent); text-decoration: none; font-weight: 500; }
    .nf a:hover { text-decoration: underline; }
  `],
})
export class NotFoundComponent {}
