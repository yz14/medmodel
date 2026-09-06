import { Navigate } from 'react-router-dom'

/** FE-5: /viewer 与数据中心去重；保留 /viewer/:studyId 正式阅片。 */
export function ViewerHomePage() {
  return <Navigate to="/data" replace />
}
