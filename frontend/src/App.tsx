import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { ProyectosPage } from './pages/ProyectosPage'
import { RegistrarAbonoPage } from './pages/RegistrarAbonoPage'
import { RegistrarVentaPage } from './pages/RegistrarVentaPage'
import { VentaDetallePage } from './pages/VentaDetallePage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/proyectos" replace />} />
        <Route path="/proyectos" element={<ProyectosPage />} />
        <Route path="/ventas/nueva" element={<RegistrarVentaPage />} />
        <Route path="/ventas/:ventaId/abonos/nuevo" element={<RegistrarAbonoPage />} />
        <Route path="/ventas/:id" element={<VentaDetallePage />} />
        <Route path="/cartera" element={<PlaceholderPage title="Cartera y mora" />} />
        <Route path="/contabilidad" element={<PlaceholderPage title="Finanzas generales" />} />
        <Route path="/nomina" element={<PlaceholderPage title="Nómina y talento humano" />} />
      </Route>
    </Routes>
  )
}

export default App
