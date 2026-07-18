import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Block from './pages/Block'
import DemoLayout from './components/DemoLayout'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/demo/login" replace />} />

        <Route path="/demo" element={<DemoLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<Signup />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="block/:blockId" element={<Block />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
