import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuthContext } from "./context/AuthContext";
import NavBar from "./components/NavBar";
import ProtectedRoute from "./components/ProtectedRoute";
import { AppShell, Container, useMantineTheme, useMantineColorScheme } from "@mantine/core";
import { RBACProvider, useRBAC, useRBACContext } from "@impelsysinc/react-rbac";
import AdminConsole from "./pages/admin/AdminConsole";
import AdminGuard from "./pages/admin/AdminGuard";

import Home from "./pages/Home/Home";
import Login from "./pages/login/login";
import FederationLogin from "./pages/login/FederationLogin";
import OidcAuthorization from "./pages/OidcAuthorization";
import OidcCallback from "./pages/OidcCallback";
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
  const { user } = useAuthContext();
  const { setPermissions, clearPermissions } = useRBACContext();

  useEffect(() => {
    const granted = Array.isArray(user?.permissions) ? user.permissions : [];
    if (!granted.length) {
      clearPermissions();
      return;
    }

    const normalized = granted
      .map((permission) => {
        const raw = String(permission || "").trim();
        const splitAt = raw.lastIndexOf(":");
        if (splitAt <= 0 || splitAt === raw.length - 1) return null;
        return {
          resource: raw.slice(0, splitAt),
          action: raw.slice(splitAt + 1),
        };
      })
      .filter((item): item is { resource: string; action: string } => Boolean(item));

    if (!normalized.length) {
      clearPermissions();
      return;
    }

    setPermissions(normalized);
  }, [user?.permissions, setPermissions, clearPermissions]);

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
            <Route path="/login/federation" element={<FederationLogin />} />
            <Route path="/oidc/authorization" element={<OidcAuthorization />} />
            <Route path="/oidc/callback" element={<OidcCallback />} />

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
