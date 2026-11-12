import React from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { Redirect, Route, Router as WouterRouter, Switch, useLocation } from "wouter";
import { shadcn } from "@clerk/themes";
import "./style.css";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const recordTypes = ["conversations", "learning", "preferences"];
const localKeys = {
  conversations: "mina-teach.assistant.conversations.v1",
  learning: "minaTeach.learning.v1",
};
const appearance = {
  theme: shadcn,
  options: { logoPlacement: "inside", logoLinkUrl: "/", logoImageUrl: `${window.location.origin}/assistant/favicon.svg` },
  variables: { colorPrimary: "#1d4c9c", colorForeground: "#172541", colorBackground: "#ffffff", colorInput: "#ffffff", colorInputForeground: "#172541", colorDanger: "#b42318", colorNeutral: "#53627b", fontFamily: "Inter, system-ui, sans-serif", borderRadius: "0.75rem" },
};
function stripBase(path) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path; }

function AuthPage({ mode }) {
  const isSignIn = mode === "in";
  return <div className="auth-shell"><a className="brand" href="/"><span className="brand-mark">M</span><span><b>MINA TEACH AI</b><small>Dhaloota beekumsa omishuudha.</small></span></a><h1>{isSignIn ? "Welcome back" : "Create your student account"}</h1><p>Your learning history will be private to your account.</p>{isSignIn
    ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />}</div>;
}

function AccountPage() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const [records, setRecords] = React.useState({});
  const [status, setStatus] = React.useState("Loading your account data…");
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [preferences, setPreferences] = React.useState({ language: "en" });
  const [profileName, setProfileName] = React.useState("");
  const request = async (path, options = {}) => {
    const response = await fetch(path, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "Account request failed.");
    return body;
  };
  React.useEffect(() => {
    if (!isLoaded || !user) return;
    setProfileName(user.fullName || "");
    request("/api/account/data").then(({ records: data }) => {
      setRecords(data);
      setPreferences(data.preferences || { language: "en" });
      setStatus("Your account data is stored securely for your signed-in account.");
    }).catch(error => setStatus(error.message));
  }, [isLoaded, user]);
  if (!isLoaded) return <main className="account"><p>Loading account…</p></main>;
  if (!user) return <Redirect to="/sign-in" />;
  const saveRecord = async (type, data) => request(`/api/account/data/${type}`, { method: "PUT", body: JSON.stringify({ data }) });
  const importLocal = async () => {
    setBusy(true); setNotice("");
    try {
      const imported = {};
      for (const type of ["conversations", "learning"]) {
        const raw = localStorage.getItem(localKeys[type]);
        if (raw) {
          try { imported[type] = JSON.parse(raw); } catch { throw new Error(`Your local ${type} data could not be read. Nothing was imported.`); }
        }
      }
      if (!Object.keys(imported).length) { setNotice("No existing local study data was found. Your browser data was not changed."); return; }
      const result = await request("/api/account/import", { method: "POST", body: JSON.stringify({ records: imported }) });
      setRecords(result.records); setNotice("Study data was copied to your account. The original browser data remains on this device.");
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile: { name: user.fullName, email: user.primaryEmailAddress?.emailAddress }, records }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "mina-teach-account-data.json"; link.click(); URL.revokeObjectURL(url);
  };
  const deleteData = async () => {
    if (!window.confirm("Delete saved conversations, study progress, and preferences from this account and this browser? This cannot be undone.")) return;
    setBusy(true);
    try {
      await request("/api/account/data", { method: "DELETE" });
      Object.values(localKeys).forEach(key => localStorage.removeItem(key));
      setRecords({}); setPreferences({ language: "en" }); setNotice("Your saved Mina Teach data was deleted from this account and this browser. Your sign-in account remains active.");
    }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };
  const savePreferences = async event => {
    event.preventDefault(); setBusy(true);
    try { await saveRecord("preferences", preferences); setRecords({ ...records, preferences }); setNotice("Preferences saved to your account."); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };
  const saveProfile = async event => {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const parts = profileName.trim().split(/\s+/);
      await user.update({ firstName: parts[0] || "", lastName: parts.slice(1).join(" ") });
      setNotice("Your profile name was updated.");
    } catch {
      setNotice("Your profile could not be updated. Please try again.");
    } finally { setBusy(false); }
  };
  const count = value => Array.isArray(value) ? value.length : value && typeof value === "object" ? Object.keys(value).length : 0;
  return <main className="account">
    <header className="account-header"><a className="brand" href="/"><span className="brand-mark">M</span><span><b>MINA TEACH AI</b><small>Dhaloota beekumsa omishuudha.</small></span></a><div><a href="/learning/">Learning</a><a href="/assistant/">AI Assistant</a><button onClick={() => signOut({ redirectUrl: "/" })}>Sign out</button></div></header>
    <section className="account-card">
      <p className="eyebrow">STUDENT ACCOUNT</p><h1>Hello, {user.firstName || "student"}</h1><p className="muted">{user.primaryEmailAddress?.emailAddress}</p><p className="status" role="status">{status}</p>
      <form onSubmit={saveProfile} className="preferences"><label>Profile name<input value={profileName} maxLength={100} onChange={event => setProfileName(event.target.value)} required /></label><button disabled={busy}>Save profile</button></form>
      <form onSubmit={savePreferences} className="preferences"><label>Reply language<select value={preferences.language || "en"} onChange={event => setPreferences({ ...preferences, language: event.target.value })}><option value="en">English</option><option value="om">Afaan Oromoo</option><option value="am">Amharic</option></select></label><button disabled={busy}>Save preferences</button></form>
      <section className="data-section"><h2>Your saved data</h2><p>Conversations: {count(records.conversations)} · Learning records: {count(records.learning)}</p><div className="actions"><button disabled={busy} onClick={importLocal}>Import this browser’s study data</button><button className="secondary" onClick={exportData}>Download a copy</button><button className="danger" disabled={busy} onClick={deleteData}>Delete saved Mina Teach data</button></div><p className="muted small">Import copies data to your account and leaves the browser copy unchanged. Delete removes your stored Mina Teach data but does not delete your sign-in account.</p>{notice && <p className="notice" role="status">{notice}</p>}</section>
    </section>
    <p className="privacy">Your account is used to save your Mina Teach conversations and learning progress. You control importing, downloading, and deleting these saved records.</p>
  </main>;
}

function AppRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={appearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{ signIn: { start: { title: "Welcome to MINA TEACH AI", subtitle: "Sign in to access your private learning data" } }, signUp: { start: { title: "Create your MINA TEACH AI account", subtitle: "Save your learning progress securely" } } }} routerPush={to => setLocation(stripBase(to))} routerReplace={to => setLocation(stripBase(to), { replace: true })}>
    <Switch>
      <Route path="/sign-in/*?" component={() => <AuthPage mode="in" />} />
      <Route path="/sign-up/*?" component={() => <AuthPage mode="up" />} />
      <Route path="/" component={AccountPage} />
      <Route><Redirect to="/" /></Route>
    </Switch>
  </ClerkProvider>;
}

if (!clerkPubKey) document.getElementById("root").textContent = "Account sign-in setup is unavailable. Please contact the site administrator.";
else createRoot(document.getElementById("root")).render(<WouterRouter base={basePath}><AppRoutes /></WouterRouter>);
