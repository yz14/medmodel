import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/app/AppLayout'
import { Skeleton } from '@/components/ui/skeleton'

const DashboardPage = lazy(() =>
  import('@/pages/dashboard').then((m) => ({ default: m.DashboardPage })),
)
const DataPage = lazy(() => import('@/pages/data').then((m) => ({ default: m.DataPage })))
const ViewerPage = lazy(() => import('@/pages/viewer').then((m) => ({ default: m.ViewerPage })))
const ViewerCs3dPage = lazy(() =>
  import('@/pages/viewer-cs3d').then((m) => ({ default: m.ViewerCs3dPage })),
)
const ViewerHomePage = lazy(() =>
  import('@/pages/viewer-home').then((m) => ({ default: m.ViewerHomePage })),
)
const ModelsPage = lazy(() => import('@/pages/models').then((m) => ({ default: m.ModelsPage })))
const ModelDetailPage = lazy(() =>
  import('@/pages/model-detail').then((m) => ({ default: m.ModelDetailPage })),
)
const TasksPage = lazy(() => import('@/pages/tasks').then((m) => ({ default: m.TasksPage })))
const TaskDetailPage = lazy(() =>
  import('@/pages/task-detail').then((m) => ({ default: m.TaskDetailPage })),
)
const SettingsPage = lazy(() =>
  import('@/pages/settings').then((m) => ({ default: m.SettingsPage })),
)
const ClinicalPage = lazy(() =>
  import('@/pages/clinical').then((m) => ({ default: m.ClinicalPage })),
)
const AnnotationPage = lazy(() =>
  import('@/pages/annotation').then((m) => ({ default: m.AnnotationPage })),
)

function PageFallback() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="data" element={<DataPage />} />
            <Route path="viewer" element={<ViewerHomePage />} />
            <Route path="viewer/:studyId" element={<ViewerPage />} />
            <Route path="viewer-cs3d/:studyId" element={<ViewerCs3dPage />} />
            <Route path="models" element={<ModelsPage />} />
            <Route path="models/:modelId" element={<ModelDetailPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="tasks/:taskId" element={<TaskDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="clinical" element={<ClinicalPage />} />
            <Route path="annotation" element={<AnnotationPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
