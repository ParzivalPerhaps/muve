import { Navigate, Route, Routes } from 'react-router-dom'
import AddressLookupPage from './pages/AddressLookupPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<AddressLookupPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
