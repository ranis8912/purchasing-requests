import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./styles/app.css";
import Layout from "./components/Layout";
import { ToastProvider } from "./components/ui";
import Dashboard from "./pages/Dashboard";
import NewRequest from "./pages/NewRequest";
import Requests from "./pages/Requests";
import RequestDetail from "./pages/RequestDetail";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import RouteError from "./pages/RouteError";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
});

const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      {
        // Page errors render inside the layout, so the header and navigation stay usable.
        errorElement: <RouteError />,
        children: [
          { path: "/", element: <Dashboard /> },
          { path: "/new", element: <NewRequest /> },
          { path: "/requests", element: <Requests /> },
          { path: "/requests/:number", element: <RequestDetail /> },
          { path: "/admin", element: <Admin /> },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
