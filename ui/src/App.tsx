import { BrowserRouter, Routes, Route } from 'react-router-dom'
import StreamsPage from './pages/StreamsPage'
import DashboardPage from './pages/DashboardPage'
import HistoryPage from './pages/HistoryPage'
import DspPage from './pages/DspPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StreamsPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/dashboard/history" element={<HistoryPage />} />
        <Route path="/dsp" element={<DspPage />} />
      </Routes>
    </BrowserRouter>
  )
}
