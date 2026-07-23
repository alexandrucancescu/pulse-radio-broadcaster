import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import StreamsPage from './pages/StreamsPage'
import LoginPage from './pages/LoginPage'
import LivePage from './pages/LivePage'
import HistoryPage from './pages/HistoryPage'
import DspPage from './pages/DspPage'
import AdminLayout from './components/AdminLayout'
import StationConfigPage from './pages/config/StationConfigPage'
import InputsConfigPage from './pages/config/InputsConfigPage'
import StreamsConfigPage from './pages/config/StreamsConfigPage'
import ServerConfigPage from './pages/config/ServerConfigPage'
import LibraryPage from './pages/LibraryPage'
import UsersPage from './pages/UsersPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StreamsPage />} />
        <Route path="/login" element={<LoginPage />} />

        <Route path="/dashboard" element={<AdminLayout />}>
          <Route index element={<LivePage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="dsp" element={<DspPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="config/station" element={<StationConfigPage />} />
          <Route path="config/inputs" element={<InputsConfigPage />} />
          <Route path="config/streams" element={<StreamsConfigPage />} />
          <Route path="config/server" element={<ServerConfigPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>

        {/* Old bookmark support */}
        <Route path="/dsp" element={<Navigate to="/dashboard/dsp" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
