import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { AdminAuditPage } from "./pages/AdminAuditPage";
import { AdminClientsPage } from "./pages/AdminClientsPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { EnrollMfaPage } from "./pages/EnrollMfaPage";
import { ClientPage } from "./pages/ClientPage";
import { LoginPage } from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";
import { SecurityPage } from "./pages/SecurityPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<OverviewPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/enroll-2fa" element={<EnrollMfaPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/clients/:id" element={<ClientPage />} />
        <Route
          path="/admin/users"
          element={
            <RequireAuth adminOnly>
              <AdminUsersPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/clients"
          element={
            <RequireAuth adminOnly>
              <AdminClientsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <RequireAuth adminOnly>
              <AdminAuditPage />
            </RequireAuth>
          }
        />
      </Route>
    </Routes>
  );
}
