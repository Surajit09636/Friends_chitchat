// Router components for SPA navigation and redirects.
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
// Auth pages and protected home.
import Login from "./pages/login";
import Signup from "./pages/signup";
import Home from "./pages/home";
import RequireAuth from "./components/RequireAuth";

function App() {
  return (
    // Top-level router context for the app.
    <BrowserRouter>
      <Routes>
        {/* Protected home route. */}
        <Route
          path="/"
          element={
            <RequireAuth>
              <Home />
            </RequireAuth>
          }
        />
        {/* Auth routes. */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        {/* Catch-all route to handle unknown paths. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

// App entry component.
export default App;
