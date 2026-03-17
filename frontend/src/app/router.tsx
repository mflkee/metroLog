import { createBrowserRouter, Navigate } from "react-router-dom";

import { ShellLayout } from "@/app/ShellLayout";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { DashboardPage } from "@/pages/DashboardPage";
import { EquipmentCardsPage } from "@/pages/EquipmentCardsPage";
import { EquipmentDetailsPage } from "@/pages/EquipmentDetailsPage";
import { EquipmentPage } from "@/pages/EquipmentPage";
import { EventsPage } from "@/pages/EventsPage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { RegisterPage } from "@/pages/RegisterPage";
import { RepairsPage } from "@/pages/RepairsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { VerificationPage } from "@/pages/VerificationPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/dashboard" replace />,
  },
  {
    element: <AuthLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
    ],
  },
  {
    element: <ShellLayout />,
    children: [
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/equipment", element: <EquipmentPage /> },
      { path: "/equipment/:equipmentId", element: <EquipmentDetailsPage /> },
      { path: "/equipment-cards", element: <EquipmentCardsPage /> },
      { path: "/verification/si", element: <VerificationPage /> },
      { path: "/repairs", element: <RepairsPage /> },
      { path: "/events", element: <EventsPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/profile", element: <ProfilePage /> },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);
