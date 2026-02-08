// Router components for SPA navigation and redirects.
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
// Auth pages.
import Login from "./pages/login";
import Signup from "./pages/signup";

function App() {
  return (
    // Top-level router context for the app.
    <BrowserRouter>
      <Routes>
        {/* Redirect the base path to login. */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        {/* Auth routes. */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        {/* Catch-all route to handle unknown paths. */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

// App entry component.
export default App;
