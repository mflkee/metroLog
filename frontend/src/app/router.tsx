import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { RequireAuth, RequireGuest, RequireRoles } from "@/app/RouteGuards";
import { ShellLayout } from "@/app/ShellLayout";
import { AuthLayout } from "@/components/layout/AuthLayout";

const AdminUsersPage = lazy(() =>
  import("@/pages/AdminUsersPage").then((module) => ({ default: module.AdminUsersPage })),
);
const ArshinPage = lazy(() =>
  import("@/pages/ArshinPage").then((module) => ({ default: module.ArshinPage })),
);
const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((module) => ({ default: module.DashboardPage })),
);
const DeveloperDashboardPage = lazy(() =>
  import("@/pages/DeveloperDashboardPage").then((module) => ({
    default: module.DeveloperDashboardPage,
  })),
);
const EquipmentDetailsPage = lazy(() =>
  import("@/pages/EquipmentDetailsPage").then((module) => ({
    default: module.EquipmentDetailsPage,
  })),
);
const EquipmentPage = lazy(() =>
  import("@/pages/EquipmentPage").then((module) => ({ default: module.EquipmentPage })),
);
const EsiMonitoringPage = lazy(() =>
  import("@/pages/EsiMonitoringPage").then((module) => ({
    default: module.EsiMonitoringPage,
  })),
);
const EventsPage = lazy(() =>
  import("@/pages/EventsPage").then((module) => ({ default: module.EventsPage })),
);
const HelpPage = lazy(() =>
  import("@/pages/HelpPage").then((module) => ({ default: module.HelpPage })),
);
const LoginPage = lazy(() =>
  import("@/pages/LoginPage").then((module) => ({ default: module.LoginPage })),
);
const NotFoundPage = lazy(() =>
  import("@/pages/NotFoundPage").then((module) => ({ default: module.NotFoundPage })),
);
const ProfilePage = lazy(() =>
  import("@/pages/ProfilePage").then((module) => ({ default: module.ProfilePage })),
);
const RepairsPage = lazy(() =>
  import("@/pages/RepairsPage").then((module) => ({ default: module.RepairsPage })),
);
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((module) => ({ default: module.SettingsPage })),
);
const TasksPage = lazy(() =>
  import("@/pages/TasksPage").then((module) => ({ default: module.TasksPage })),
);
const TaskDetailsPage = lazy(() =>
  import("@/pages/TaskDetailsPage").then((module) => ({ default: module.TaskDetailsPage })),
);
const UserDetailsPage = lazy(() =>
  import("@/pages/UserDetailsPage").then((module) => ({ default: module.UserDetailsPage })),
);
const VerificationPage = lazy(() =>
  import("@/pages/VerificationPage").then((module) => ({ default: module.VerificationPage })),
);

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/dashboard" replace />,
  },
  {
    element: <RequireGuest />,
    children: [
      {
        element: <AuthLayout />,
        children: [{ path: "/login", element: <LoginPage /> }],
      },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <ShellLayout />,
        children: [
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/equipment", element: <EquipmentPage /> },
          { path: "/equipment/esi-monitoring", element: <EsiMonitoringPage /> },
          { path: "/equipment/:equipmentId", element: <EquipmentDetailsPage /> },
          { path: "/arshin", element: <ArshinPage /> },
          { path: "/verification/si", element: <VerificationPage /> },
          { path: "/repairs", element: <RepairsPage /> },
          { path: "/tasks", element: <TasksPage /> },
          { path: "/tasks/:taskId", element: <TaskDetailsPage /> },
          { path: "/events", element: <EventsPage /> },
          { path: "/settings", element: <SettingsPage /> },
          { path: "/profile", element: <ProfilePage /> },
          { path: "/help", element: <HelpPage /> },
          {
            element: <RequireRoles allowedRoles={["DEVELOPER", "ADMINISTRATOR"]} />,
            children: [
              { path: "/developer", element: <DeveloperDashboardPage /> },
              { path: "/admin/users", element: <AdminUsersPage /> },
              { path: "/admin/users/:userId", element: <UserDetailsPage /> },
            ],
          },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);
