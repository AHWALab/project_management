import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { isConfigured } from "./lib/supabase";
import { useSession } from "./lib/hooks";
import { Spinner } from "./components/bits";
import Setup from "./pages/Setup";
import SignIn from "./pages/SignIn";
import Landing from "./pages/Landing";
import ProjectPage from "./pages/Project";

export default function App() {
  const { me, loading } = useSession();

  if (!isConfigured) return <Setup />;
  if (loading) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <Spinner label="Signing you in" />
      </div>
    );
  }
  if (!me) return <SignIn />;

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Landing me={me} />} />
        <Route path="/project/:id" element={<ProjectPage me={me} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
