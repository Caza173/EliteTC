import { Route, Switch, useLocation } from "wouter";
import { useEffect } from "react";
import Login from "./pages/Login";
import Verify from "./pages/Verify";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import Transactions from "./pages/Transactions";
import TransactionDetail from "./pages/TransactionDetail";
import AppLayout from "./components/AppLayout";
import { useSession, type SessionUser } from "./lib/session";

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
      <Route path="/">{session.data ? <Authed user={session.data} page="home" /> : null}</Route>
      <Route path="/transactions/:id">
        {(params) =>
          session.data ? <Authed user={session.data} page="detail" id={params.id} /> : null
        }
      </Route>
      <Route path="/transactions">
        {session.data ? <Authed user={session.data} page="transactions" /> : null}
      </Route>
      <Route path="/settings">
        {session.data ? <Authed user={session.data} page="settings" /> : null}
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

function Authed({
  user,
  page,
  id,
}: {
  user: SessionUser;
  page: "home" | "transactions" | "detail" | "settings";
  id?: string;
}) {
  return (
    <AppLayout user={user}>
      {page === "home" && <Home user={user} />}
      {page === "transactions" && <Transactions />}
      {page === "detail" && id && <TransactionDetail id={id} />}
      {page === "settings" && <Settings user={user} />}
    </AppLayout>
  );
}
