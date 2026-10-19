import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RutaInicial } from './components/RutaInicial'
import { AuthProvider } from './contexts/AuthContext'
import { EmpresaProvider } from './contexts/EmpresaContext'
import { PERMISOS } from './lib/permisos'
import { AuditoriaPage } from './pages/AuditoriaPage'
import { CajaPage } from './pages/CajaPage'
import { CarteraPage } from './pages/CarteraPage'
import { CierreDetallePage } from './pages/CierreDetallePage'
import { ConfiguracionPage } from './pages/ConfiguracionPage'
import { ContabilidadPage } from './pages/ContabilidadPage'
import { DashboardPage } from './pages/DashboardPage'
import { EditarUsuarioPage } from './pages/EditarUsuarioPage'
import { LoginPage } from './pages/LoginPage'
import { LoteDetallePage } from './pages/LoteDetallePage'
import { MovimientoDetallePage } from './pages/MovimientoDetallePage'
import { NominaPage } from './pages/NominaPage'
import { ProyectoDetallePage } from './pages/ProyectoDetallePage'
import { ProyectoFinanzasPage } from './pages/ProyectoFinanzasPage'
import { ProyectosPage } from './pages/ProyectosPage'
import { RecibosPage } from './pages/RecibosPage'
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
import { VentasPage } from './pages/VentasPage'

// Las rutas se protegen por permiso (no por nombre de rol): un rol nuevo
// funciona sin tocar este archivo. Las rutas sin permiso exigen solo sesión.
function App() {
  return (
    <EmpresaProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<RutaInicial />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/proyectos" element={<ProyectosPage />} />
              <Route path="/proyectos/nuevo" element={<RegistrarProyectoPage />} />
              <Route path="/proyectos/:id/lotes/nuevo" element={<RegistrarLotePage />} />
              <Route path="/proyectos/:id" element={<ProyectoDetallePage />} />
              <Route path="/lotes/:id" element={<LoteDetallePage />} />
              <Route path="/ventas" element={<VentasPage />} />
              <Route path="/ventas/nueva" element={<RegistrarVentaPage />} />
              <Route path="/ventas/:ventaId/abonos/nuevo" element={<RegistrarAbonoPage />} />
              <Route path="/ventas/:id" element={<VentaDetallePage />} />
              <Route path="/recibos" element={<RecibosPage />} />
              <Route element={<ProtectedRoute permiso={PERMISOS.CAJA_VER} />}>
                <Route path="/caja" element={<CajaPage />} />
                <Route path="/caja/:id" element={<CierreDetallePage />} />
              </Route>
              <Route path="/cartera" element={<CarteraPage />} />
              <Route path="/finanzas" element={<ContabilidadPage />} />
              <Route path="/finanzas/nuevo" element={<RegistrarMovimientoPage />} />
              <Route path="/finanzas/movimientos/:id" element={<MovimientoDetallePage />} />
              <Route path="/proyectos/:id/finanzas" element={<ProyectoFinanzasPage />} />
              <Route path="/contabilidad" element={<Navigate to="/finanzas" replace />} />

              <Route element={<ProtectedRoute permiso={PERMISOS.NOMINA_VER} />}>
                <Route path="/nomina" element={<NominaPage />} />
                <Route path="/trabajadores/nuevo" element={<RegistrarTrabajadorPage />} />
                <Route path="/trabajadores/:id/pagos/nuevo" element={<RegistrarPagoNominaPage />} />
                <Route path="/trabajadores/:id" element={<TrabajadorDetallePage />} />
              </Route>

              <Route element={<ProtectedRoute permiso={PERMISOS.AUDITORIA_VER} />}>
                <Route path="/auditoria" element={<AuditoriaPage />} />
              </Route>

              <Route element={<ProtectedRoute permiso={PERMISOS.USUARIOS_GESTIONAR} />}>
                <Route path="/usuarios" element={<UsuariosPage />} />
                <Route path="/usuarios/nuevo" element={<RegistrarUsuarioPage />} />
                <Route path="/usuarios/:id/editar" element={<EditarUsuarioPage />} />
              </Route>

              <Route element={<ProtectedRoute permiso={PERMISOS.CONFIGURACION_EDITAR} />}>
                <Route path="/configuracion" element={<ConfiguracionPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </EmpresaProvider>
  )
}

export default App
