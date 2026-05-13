import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/workflows-list/workflows-list.component')
      .then(m => m.WorkflowsListComponent)
  },
  {
    path: 'workflow/:id',
    loadComponent: () => import('./pages/workflow-editor/workflow-editor.component')
      .then(m => m.WorkflowEditorComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
