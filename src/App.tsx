import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { DeskShell } from './components/DeskShell'
import { Banner } from './components/ui'
import { supabaseConfigError } from './lib/supabase'
import { CollectPage } from './pages/CollectPage'
import { ImportPage } from './pages/ImportPage'
import { JoinPage } from './pages/JoinPage'
import { MembershipPage } from './pages/MembershipPage'
import { PaymentsPage } from './pages/PaymentsPage'
import { ReceiptPage } from './pages/ReceiptPage'
import { SendPage } from './pages/SendPage'
import { ChitEditorPage } from './pages/desk/ChitEditorPage'
import { ChitsPage } from './pages/desk/ChitsPage'
import { DashboardPage } from './pages/desk/DashboardPage'
import { MemberEditorPage } from './pages/desk/MemberEditorPage'
import { MemberProfilePage } from './pages/desk/MemberProfilePage'
import { MembersDeskPage } from './pages/desk/MembersDeskPage'
import { NewChitPage } from './pages/desk/NewChitPage'
import { ReportsDeskPage } from './pages/desk/ReportsDeskPage'

export default function App() {
  if (supabaseConfigError) {
    return (
      <div className="mx-auto max-w-[430px] p-6">
        <Banner>{supabaseConfigError}</Banner>
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<DeskShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/chits" element={<ChitsPage />} />
        <Route path="/chits/new" element={<NewChitPage />} />
        <Route path="/chits/:groupId" element={<ChitEditorPage />} />
        <Route path="/groups/new" element={<Navigate to="/chits/new" replace />} />
        <Route path="/groups/:groupId" element={<OpenGroup />} />
        <Route path="/groups/:groupId/edit" element={<EditGroup />} />
        <Route path="/groups/:groupId/join" element={<JoinPage />} />
        <Route path="/members" element={<MembersDeskPage />} />
        <Route path="/members/new" element={<MemberEditorPage />} />
        <Route path="/members/:memberId/edit" element={<MemberEditorPage />} />
        <Route path="/members/:memberId" element={<MemberProfilePage />} />
        <Route path="/memberships/:membershipId" element={<MembershipPage />} />
        <Route path="/collect" element={<CollectPage />} />
        <Route path="/collect/:membershipId" element={<CollectPage />} />
        <Route path="/send" element={<SendPage />} />
        <Route path="/send/:membershipId" element={<SendPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/receipts/:receiptId" element={<ReceiptPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/reports" element={<ReportsDeskPage />} />
        <Route path="/more" element={<Navigate to="/chits" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function OpenGroup() {
  const { groupId } = useParams()
  return <Navigate to={`/?chit=${groupId ?? ''}`} replace />
}

function EditGroup() {
  const { groupId } = useParams()
  return <Navigate to={`/chits/${groupId ?? ''}`} replace />
}
