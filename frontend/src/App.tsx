import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './contexts/AuthContext'
import { CarteraPage } from './pages/CarteraPage'
import { ContabilidadPage } from './pages/ContabilidadPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { NominaPage } from './pages/NominaPage'
import { ProyectoDetallePage } from './pages/ProyectoDetallePage'
import { ProyectosPage } from './pages/ProyectosPage'
import { RegistrarAbonoPage } from './pages/RegistrarAbonoPage'
import { RegistrarLotePage } from './pages/RegistrarLotePage'
import { RegistrarMovimientoPage } from './pages/RegistrarMovimientoPage'
import { RegistrarPagoNominaPage } from './pages/RegistrarPagoNominaPage'
import { RegistrarProyectoPage } from './pages/RegistrarProyectoPage'
import { RegistrarTrabajadorPage } from './pages/RegistrarTrabajadorPage'
import { RegistrarUsuarioPage } from './pages/RegistrarUsuarioPage'
import { RegistrarVentaPage } from './pages/RegistrarVentaPage'
import { TrabajadorDetallePage } from './pages/TrabajadorDetallePage'
import { UsuariosPage } from './pages/UsuariosPage'
import { VentaDetallePage } from './pages/VentaDetallePage'

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/proyectos" element={<ProyectosPage />} />
            <Route path="/proyectos/nuevo" element={<RegistrarProyectoPage />} />
            <Route path="/proyectos/:id/lotes/nuevo" element={<RegistrarLotePage />} />
            <Route path="/proyectos/:id" element={<ProyectoDetallePage />} />
            <Route path="/ventas/nueva" element={<RegistrarVentaPage />} />
            <Route path="/ventas/:ventaId/abonos/nuevo" element={<RegistrarAbonoPage />} />
            <Route path="/ventas/:id" element={<VentaDetallePage />} />
            <Route path="/cartera" element={<CarteraPage />} />
            <Route path="/contabilidad" element={<ContabilidadPage />} />
            <Route path="/contabilidad/nuevo" element={<RegistrarMovimientoPage />} />
            <Route path="/nomina" element={<NominaPage />} />
            <Route path="/trabajadores/nuevo" element={<RegistrarTrabajadorPage />} />
            <Route path="/trabajadores/:id/pagos/nuevo" element={<RegistrarPagoNominaPage />} />
            <Route path="/trabajadores/:id" element={<TrabajadorDetallePage />} />
            <Route path="/usuarios" element={<UsuariosPage />} />
            <Route path="/usuarios/nuevo" element={<RegistrarUsuarioPage />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  )
}

export default App
