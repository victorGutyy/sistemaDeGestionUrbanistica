import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RutaInicial } from './components/RutaInicial'
import { AuthProvider } from './contexts/AuthContext'
import { EmpresaProvider } from './contexts/EmpresaContext'
import { PERMISOS } from './lib/permisos'
import { AuditoriaPage } from './pages/AuditoriaPage'
import { CajaPage } from './pages/CajaPage'
import { EquipoDetallePage } from './pages/EquipoDetallePage'
import { ClienteDetallePage } from './pages/ClienteDetallePage'
import { ClientesPage } from './pages/ClientesPage'
import { ComisionesPage } from './pages/ComisionesPage'
import { ImportacionLayout } from './components/importacion/ImportacionLayout'
import { ImportacionPage } from './pages/ImportacionPage'
import { ImportacionSstPage } from './pages/ImportacionSstPage'
import { CarteraPage } from './pages/CarteraPage'
import { CierreDetallePage } from './pages/CierreDetallePage'
import { ConfiguracionPage } from './pages/ConfiguracionPage'
import { ConfiguracionSeguridadSocialPage } from './pages/ConfiguracionSeguridadSocialPage'
import { EditarTrabajadorPage } from './pages/EditarTrabajadorPage'
import { SstLayout } from './components/sst/SstLayout'
import { ListaAusentismos } from './components/ausentismo/ListaAusentismos'
import { ListaRecobros } from './components/ausentismo/ListaRecobros'
import { NovedadesAusentismo } from './components/ausentismo/NovedadesAusentismo'
import { ResumenAusentismo } from './components/ausentismo/ResumenAusentismo'
import { SstAusentismoDetallePage } from './pages/SstAusentismoDetallePage'
import { SstAusentismoLayout } from './pages/SstAusentismoLayout'
import { SstAvisosPage } from './pages/SstAvisosPage'
import { SstCapacitacionPage } from './pages/SstCapacitacionPage'
import { SstCapacitacionesPage } from './pages/SstCapacitacionesPage'
import { SstEppPage } from './pages/SstEppPage'
import { SstPage } from './pages/SstPage'
import { SstPlanPage } from './pages/SstPlanPage'
import { SstReportesPage } from './pages/SstReportesPage'
import { SstTrabajadorPage } from './pages/SstTrabajadorPage'
import { ContabilidadPage } from './pages/ContabilidadPage'
import { DashboardPage } from './pages/DashboardPage'
import { EditarUsuarioPage } from './pages/EditarUsuarioPage'
import { LoginPage } from './pages/LoginPage'
import { RecuperarPasswordPage } from './pages/RecuperarPasswordPage'
import { RestablecerPasswordPage } from './pages/RestablecerPasswordPage'
import { LoteDetallePage } from './pages/LoteDetallePage'
import { MovimientoDetallePage } from './pages/MovimientoDetallePage'
import { NominaPage } from './pages/NominaPage'
import { ProyectoDetallePage } from './pages/ProyectoDetallePage'
import { ProyectoFinanzasPage } from './pages/ProyectoFinanzasPage'
import { ProyectosPage } from './pages/ProyectosPage'
import { RecibosPage } from './pages/RecibosPage'
import { RegistrarAbonoPage } from './pages/RegistrarAbonoPage'
import { RegistrarClientePage } from './pages/RegistrarClientePage'
import { RegistrarEquipoPage } from './pages/RegistrarEquipoPage'
import { RegistrarLotePage } from './pages/RegistrarLotePage'
import { RegistrarMovimientoPage } from './pages/RegistrarMovimientoPage'
import { RegistrarPagoNominaPage } from './pages/RegistrarPagoNominaPage'
import { RegistrarProyectoPage } from './pages/RegistrarProyectoPage'
import { RegistrarTrabajadorPage } from './pages/RegistrarTrabajadorPage'
import { RegistrarUsuarioPage } from './pages/RegistrarUsuarioPage'
import { RegistrarVentaPage } from './pages/RegistrarVentaPage'
import { NotificacionesPage } from './pages/NotificacionesPage'
import { PorVerificarPage } from './pages/PorVerificarPage'
import { ReportesPage } from './pages/ReportesPage'
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
          <Route path="/recuperar" element={<RecuperarPasswordPage />} />
          <Route path="/restablecer" element={<RestablecerPasswordPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<RutaInicial />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/proyectos" element={<ProyectosPage />} />
              <Route path="/proyectos/nuevo" element={<RegistrarProyectoPage />} />
              <Route path="/proyectos/:id/lotes/nuevo" element={<RegistrarLotePage />} />
              <Route path="/proyectos/:id" element={<ProyectoDetallePage />} />
              <Route path="/lotes/:id" element={<LoteDetallePage />} />
              <Route path="/equipos/:id" element={<EquipoDetallePage />} />
              <Route element={<ProtectedRoute permiso={PERMISOS.EQUIPOS_GESTIONAR} />}>
                <Route path="/proyectos/:id/equipos/nuevo" element={<RegistrarEquipoPage />} />
              </Route>
              <Route path="/ventas" element={<VentasPage />} />
              <Route path="/ventas/nueva" element={<RegistrarVentaPage />} />
              <Route path="/ventas/:ventaId/abonos/nuevo" element={<RegistrarAbonoPage />} />
              <Route path="/ventas/:id" element={<VentaDetallePage />} />
              <Route element={<ProtectedRoute permiso={PERMISOS.CLIENTES_VER} />}>
                <Route path="/clientes" element={<ClientesPage />} />
                <Route path="/clientes/:id" element={<ClienteDetallePage />} />
              </Route>
              <Route element={<ProtectedRoute permiso={PERMISOS.CLIENTES_CREAR} />}>
                <Route path="/clientes/nuevo" element={<RegistrarClientePage />} />
              </Route>
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
              <Route element={<ProtectedRoute permiso={PERMISOS.REPORTES_VER} />}>
                <Route path="/reportes" element={<ReportesPage />} />
              </Route>
              <Route element={<ProtectedRoute permiso={PERMISOS.ABONOS_VERIFICAR} />}>
                <Route path="/por-verificar" element={<PorVerificarPage />} />
              </Route>
              <Route element={<ProtectedRoute permiso={PERMISOS.NOTIFICACIONES_VER} />}>
                <Route path="/notificaciones" element={<NotificacionesPage />} />
              </Route>
              <Route element={<ProtectedRoute permiso={PERMISOS.COMISIONES_VER} />}>
                <Route path="/comisiones" element={<ComisionesPage />} />
              </Route>
              <Route path="/contabilidad" element={<Navigate to="/finanzas" replace />} />

              <Route element={<ProtectedRoute permiso={PERMISOS.NOMINA_VER} />}>
                <Route path="/nomina" element={<NominaPage />} />
                <Route path="/trabajadores/nuevo" element={<RegistrarTrabajadorPage />} />
                <Route path="/trabajadores/:id/pagos/nuevo" element={<RegistrarPagoNominaPage />} />
                <Route path="/trabajadores/:id/editar" element={<EditarTrabajadorPage />} />
                <Route path="/trabajadores/:id" element={<TrabajadorDetallePage />} />
              </Route>

              <Route element={<ProtectedRoute permiso={PERMISOS.SST_VER} />}>
                <Route path="/sst" element={<SstLayout />}>
                  <Route index element={<SstPage />} />
                  <Route path="epp" element={<SstEppPage />} />
                  <Route path="plan" element={<SstPlanPage />} />
                  <Route path="capacitaciones" element={<SstCapacitacionesPage />} />
                  <Route path="capacitaciones/:id" element={<SstCapacitacionPage />} />
                  <Route path="ausentismo" element={<SstAusentismoLayout />}>
                    <Route index element={<ListaAusentismos />} />
                    <Route path="resumen" element={<ResumenAusentismo />} />
                    <Route path="recobros" element={<ListaRecobros />} />
                    <Route element={<ProtectedRoute permiso={PERMISOS.SST_VALORES_VER} />}>
                      <Route path="novedades" element={<NovedadesAusentismo />} />
                    </Route>
                    <Route path=":id" element={<SstAusentismoDetallePage />} />
                  </Route>
                  <Route path="reportes" element={<SstReportesPage />} />
                  <Route path="avisos" element={<SstAvisosPage />} />
                  <Route path="trabajadores/:id" element={<SstTrabajadorPage />} />
                </Route>
              </Route>

              <Route element={<ProtectedRoute permiso={PERMISOS.AUDITORIA_VER} />}>
                <Route path="/auditoria" element={<AuditoriaPage />} />
              </Route>

              <Route element={<ProtectedRoute permiso={PERMISOS.IMPORTACION_GESTIONAR} />}>
                <Route path="/importacion" element={<ImportacionLayout />}>
                  <Route index element={<ImportacionPage />} />
                  <Route path="sst" element={<ImportacionSstPage />} />
                </Route>
              </Route>

              <Route element={<ProtectedRoute permiso={PERMISOS.USUARIOS_GESTIONAR} />}>
                <Route path="/usuarios" element={<UsuariosPage />} />
                <Route path="/usuarios/nuevo" element={<RegistrarUsuarioPage />} />
                <Route path="/usuarios/:id/editar" element={<EditarUsuarioPage />} />
              </Route>

              <Route element={<ProtectedRoute permiso={PERMISOS.CONFIGURACION_EDITAR} />}>
                <Route path="/configuracion" element={<ConfiguracionPage />} />
                <Route path="/configuracion/seguridad-social" element={<ConfiguracionSeguridadSocialPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </EmpresaProvider>
  )
}

export default App
