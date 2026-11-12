import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { SocketProvider } from './context/SocketContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import OrganisationsPage from './pages/OrganisationsPage';
import OrganisationDetailPage from './pages/OrganisationDetailPage';
import RidesPage from './pages/RidesPage';
import RideDetailPage from './pages/RideDetailPage';
import RiderProfilePage from './pages/RiderProfilePage';
import RiderDashboardPage from './pages/RiderDashboardPage';
import OrganisationDashboardPage from './pages/OrganisationDashboardPage';
import CommunityPage from './pages/CommunityPage';
import RiderDiscoveryPage from './pages/RiderDiscoveryPage';
import ConnectionsPage from './pages/ConnectionsPage';
import MessagesPage from './pages/MessagesPage';
import GroupsPage from './pages/GroupsPage';
import GroupDetailPage from './pages/GroupDetailPage';
import NotificationsPage from './pages/NotificationsPage';
import MapsPage from './pages/MapsPage';
import LeaderboardsPage from './pages/LeaderboardsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AccountPage from './pages/AccountPage';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <SocketProvider>
          <BrowserRouter>
            <div className="flex min-h-screen flex-col bg-kaafila-bg text-kaafila-text">
              <Navbar />
              <main className="flex-1">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/organisations" element={<OrganisationsPage />} />
                  <Route path="/organisations/:slug" element={<OrganisationDetailPage />} />
                  <Route path="/rides" element={<RidesPage />} />
                  <Route path="/rides/:slug" element={<RideDetailPage />} />
                  <Route path="/riders/:handle" element={<RiderProfilePage />} />

                  {/* Phase 3 Community & Real-Time Routes */}
                  <Route path="/community" element={<CommunityPage />} />
                  <Route path="/community/riders" element={<RiderDiscoveryPage />} />
                  <Route path="/community/connections" element={<ConnectionsPage />} />
                  <Route path="/community/messages" element={<MessagesPage />} />
                  <Route path="/community/messages/:conversationId" element={<MessagesPage />} />
                  <Route path="/community/groups" element={<GroupsPage />} />
                  <Route path="/community/groups/:slug" element={<GroupDetailPage />} />
                  <Route path="/notifications" element={<NotificationsPage />} />

                  {/* Phase 4 Maps & Leaderboards Routes */}
                  <Route path="/maps" element={<MapsPage />} />
                  <Route path="/maps/expedition/:slug" element={<MapsPage />} />
                  <Route path="/leaderboards" element={<LeaderboardsPage />} />

                  {/* Rider Dashboard Routes */}
                  <Route path="/dashboard/rider" element={<RiderDashboardPage section="overview" />} />
                  <Route path="/dashboard/rider/profile" element={<RiderDashboardPage section="profile" />} />
                  <Route path="/dashboard/rider/tracking" element={<RiderDashboardPage section="tracking" />} />
                  <Route path="/dashboard/rider/history" element={<RiderDashboardPage section="history" />} />
                  <Route path="/dashboard/rider/rides" element={<RiderDashboardPage section="rides" />} />
                  <Route path="/dashboard/rider/upcoming" element={<RiderDashboardPage section="upcoming" />} />
                  <Route path="/dashboard/rider/stats" element={<RiderDashboardPage section="stats" />} />
                  <Route path="/dashboard/rider/settings" element={<RiderDashboardPage section="settings" />} />

                  {/* Organisation Dashboard Routes */}
                  <Route path="/dashboard/organisation" element={<OrganisationDashboardPage section="overview" />} />
                  <Route path="/dashboard/organisation/profile" element={<OrganisationDashboardPage section="profile" />} />
                  <Route path="/dashboard/organisation/rides" element={<OrganisationDashboardPage section="rides" />} />
                  <Route path="/dashboard/organisation/routes" element={<OrganisationDashboardPage section="routes" />} />
                  <Route path="/dashboard/organisation/create" element={<OrganisationDashboardPage section="create" />} />
                  <Route path="/dashboard/organisation/riders" element={<OrganisationDashboardPage section="riders" />} />
                  <Route path="/dashboard/organisation/analytics" element={<OrganisationDashboardPage section="analytics" />} />
                  <Route path="/dashboard/organisation/settings" element={<OrganisationDashboardPage section="settings" />} />

                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/account" element={<AccountPage />} />
                  <Route path="*" element={<HomePage />} />
                </Routes>
              </main>
              <Footer />
            </div>
          </BrowserRouter>
        </SocketProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
