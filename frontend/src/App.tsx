import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { ProyectosPage } from './pages/ProyectosPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/proyectos" replace />} />
        <Route path="/proyectos" element={<ProyectosPage />} />
        <Route path="/cartera" element={<PlaceholderPage title="Cartera y mora" />} />
        <Route path="/contabilidad" element={<PlaceholderPage title="Finanzas generales" />} />
        <Route path="/nomina" element={<PlaceholderPage title="Nómina y talento humano" />} />
      </Route>
    </Routes>
  )
}

export default App
