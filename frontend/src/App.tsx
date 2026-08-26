import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { usePortalAuth } from "./portal/PortalAuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Jobs from "./pages/Jobs";
import JobDetail from "./pages/JobDetail";
import Schedule from "./pages/Schedule";
import Users from "./pages/Users";
import Estimates from "./pages/Estimates";
import EstimateDetail from "./pages/EstimateDetail";
import Invoices from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";
import Pricebook from "./pages/Pricebook";
import EmailTemplates from "./pages/EmailTemplates";
import NotificationLog from "./pages/NotificationLog";
import MessagesInbox from "./pages/MessagesInbox";
import CustomerMessages from "./pages/CustomerMessages";
import CustomerDocuments from "./pages/CustomerDocuments";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import PortalLayout from "./portal/PortalLayout";
import PortalLogin from "./portal/PortalLogin";
import PortalAcceptInvite from "./portal/PortalAcceptInvite";
import PortalJobs from "./portal/PortalJobs";
import PortalEstimates from "./portal/PortalEstimates";
import PortalEstimateDetail from "./portal/PortalEstimateDetail";
import PortalInvoices from "./portal/PortalInvoices";
import PortalInvoiceDetail from "./portal/PortalInvoiceDetail";
import PortalMessages from "./portal/PortalMessages";
import PortalDocuments from "./portal/PortalDocuments";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <p style={{ padding: 24 }}>Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequirePortalAuth({ children }: { children: JSX.Element }) {
  const { customer, loading } = usePortalAuth();
  if (loading) return <p style={{ padding: 24 }}>Loading…</p>;
  if (!customer) return <Navigate to="/portal/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="customers/:id/messages" element={<CustomerMessages />} />
        <Route path="customers/:id/documents" element={<CustomerDocuments />} />
        <Route path="settings" element={<Settings />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings/users" element={<Users />} />
        <Route path="estimates" element={<Estimates />} />
        <Route path="estimates/:id" element={<EstimateDetail />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/:id" element={<InvoiceDetail />} />
        <Route path="pricebook" element={<Pricebook />} />
        <Route path="settings/templates" element={<EmailTemplates />} />
        <Route path="settings/notification-log" element={<NotificationLog />} />
        <Route path="messages" element={<MessagesInbox />} />
      </Route>

      <Route path="/portal/login" element={<PortalLogin />} />
      <Route path="/portal/accept-invite" element={<PortalAcceptInvite />} />
      <Route
        path="/portal"
        element={
          <RequirePortalAuth>
            <PortalLayout />
          </RequirePortalAuth>
        }
      >
        <Route index element={<PortalJobs />} />
        <Route path="estimates" element={<PortalEstimates />} />
        <Route path="estimates/:id" element={<PortalEstimateDetail />} />
        <Route path="invoices" element={<PortalInvoices />} />
        <Route path="invoices/:id" element={<PortalInvoiceDetail />} />
        <Route path="messages" element={<PortalMessages />} />
        <Route path="documents" element={<PortalDocuments />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
