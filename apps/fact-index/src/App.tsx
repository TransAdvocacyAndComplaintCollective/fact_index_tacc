import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuthContext } from "./context/AuthContext";
import NavBar from "./components/NavBar";
import ProtectedRoute from "./components/ProtectedRoute";
import { AppShell, Container, useMantineTheme, useMantineColorScheme } from "@mantine/core";
import { RBACProvider, useRBAC, useRBACContext } from "@impelsysinc/react-rbac";
import AdminMagicLink from "./pages/admin/AdminMagicLink";
import AdminConsole from "./pages/admin/AdminConsole";
import AdminGuard from "./pages/admin/AdminGuard";

import Home from "./pages/Home/Home";
import Login from "./pages/login/login";
import FactDatabase from "./pages/FactDatabase/FactDatabase";
import FactDetail from "./pages/FactDatabase/FactDetail";
import FactEdit from "./pages/FactDatabase/FactEdit";
import '@mantine/core/styles.css';



// Helper component for login redirect logic
function LoginRedirect() {
  const { authenticated, loading } = useAuthContext();

  if (loading) return <div>Loading...</div>;
  return authenticated ? <Navigate to="/admin" /> : <Login />;
}

function RBACPermissionsSync() {
  const { isAdmin } = useAuthContext();
  const { setPermissions, clearPermissions } = useRBACContext();

  useEffect(() => {
    if (isAdmin) {
      setPermissions([{ resource: "admin.magiclink", action: "create" }]);
    } else {
      clearPermissions();
    }
  }, [isAdmin, setPermissions, clearPermissions]);

  return null;
}

function AppContent() {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';
  const bgColor = isDark ? theme.colors.dark[8] : theme.colors.gray[0];

  return (
    <AppShell 
      header={{ height: 70 }}
      navbar={{ width: { base: 0 }, breakpoint: "sm" }}
      padding="md"
      style={{
        backgroundColor: bgColor,
        transition: 'background-color 150ms ease',
      }}
    >
      <AppShell.Header>
        <NavBar />
      </AppShell.Header>
      <AppShell.Main>
        <Container fluid px={0}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<LoginRedirect />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/facts" element={<FactDatabase />} />
              <Route path="/facts/new" element={<FactEdit />} />
              <Route path="/facts/:id" element={<FactDetail />} />
              <Route path="/facts/:id/edit" element={<FactEdit />} />
              <Route
                path="/admin"
                element={
                  <AdminGuard>
                    <AdminConsole />
                  </AdminGuard>
                }
              />
              <Route
                path="/admin/magiclink"
                element={
                  <AdminGuard>
                    <AdminMagicLink />
                  </AdminGuard>
                }
              />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

function App() {
  const rbac = useRBAC();

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RBACProvider rbac={rbac}>
        <AuthProvider>
          <RBACPermissionsSync />
          <AppContent />
        </AuthProvider>
      </RBACProvider>
    </Router>
  );
}

export default App;
