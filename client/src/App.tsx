import { Route, Switch, useLocation } from "wouter";
import { useEffect } from "react";
import Login from "./pages/Login";
import Verify from "./pages/Verify";
import Home from "./pages/Home";
import { useSession } from "./lib/session";

export default function App() {
  const session = useSession();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (session.isLoading) return;
    const isAuthRoute = location === "/login" || location.startsWith("/auth/verify");
    if (!session.data && !isAuthRoute) navigate("/login");
    if (session.data && location === "/login") navigate("/");
  }, [session.isLoading, session.data, location, navigate]);

  if (session.isLoading) {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif", padding: 48, color: "#555" }}>
        Loading...
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/auth/verify" component={Verify} />
      <Route path="/login" component={Login} />
      <Route path="/">
        {session.data ? <Home user={session.data} /> : null}
      </Route>
      <Route>
        <div style={{ fontFamily: "system-ui, sans-serif", padding: 48 }}>
          <h1>Not found</h1>
          <p>
            <a href="/">Home</a>
          </p>
        </div>
      </Route>
    </Switch>
  );
}
