import { useEffect, useState } from "react";
import TopMenu, { applyFontSize } from "./top-menu/TopMenu.jsx";
import TalkTrackDialog from "./talk-track/TalkTrackDialog.jsx";
import AboutDialog from "./about/AboutDialog.jsx";
import ModeToggle from "./components/ModeToggle.jsx";
import PresenterSay from "./components/PresenterSay.jsx";
import useLab from "./hooks/useLab";
import InspectorPage from "./pages/InspectorPage.jsx";
import DiagramPage from "./pages/DiagramPage.jsx";
import StoriesPage from "./pages/StoriesPage.jsx";
import LimitsPage from "./pages/LimitsPage.jsx";
import { visible } from "./safeText";
import { pageFromHash, shortcutTarget } from "./nav.js";

export const PAGES = [
  { id: "inspector", label: "Inspector", View: InspectorPage },
  { id: "diagram", label: "Diagram", View: DiagramPage },
  { id: "stories", label: "Stories and talk track", View: StoriesPage },
  { id: "limits", label: "Limits (UNVERIFIED)", View: LimitsPage },
];
// Shown until the server's own banner has loaded: never blank, and never claiming more than it knows.
export const BANNER_UNKNOWN = "SIMULATED. Stub inspectors, a mock gateway, a mock model and a lab clock; nothing leaves this machine. Everything beyond the 2026-11-21 release-notes claims is this lab's own model and UNVERIFIED.";
// One line per page above the content.
const PAGE_INTRO = {
  inspector: "An LLM key holds one external inspector and an authority cap. Run a scenario or your own prompt: the verdict says whether the gateway blocked, passed, logged the finding and passed, or named an error, then the findings, the call path and what the run left behind.",
  diagram: "The flow from the app through AI Guard to the key's inspector, drawn from diagram-studio data. Drag the boxes, Simulate the arrows, Reset puts everything back.",
  stories: "Eleven stories as data, told for an invented company. Each one opens the scenario it teaches. The talk track is the script behind them.",
  limits: "Exactly what the release notes say, and what is this lab's own model.",
};
// Which talk-track items the presenter sees on each page (ids from the server's talkTrack). The Inspector page shows the story of the scenario in view.
const PRESENTER_TALK = { diagram: ["what-is-simulated-and-what-is-not"], limits: ["what-is-simulated-and-what-is-not"], stories: ["before-you-start"] };
const THEME_KEY = "pma.theme";
const FONT_KEY = "pma.font";
const THEMES = ["auto", "light", "dark"];
function initialTheme() { try { const v = localStorage.getItem(THEME_KEY); if (THEMES.includes(v)) return v; } catch { /* storage blocked */ } return "auto"; }
function initialFont() { try { const f = localStorage.getItem(FONT_KEY); return ["S", "M", "L"].includes(f) ? f : "M"; } catch { return "M"; } }

export default function App() {
  const lab = useLab();
  const [page, setPage] = useState(pageFromHash);
  const [presenter, setPresenter] = useState(false);
  const [talkOpen, setTalkOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [theme, setTheme] = useState(initialTheme);
  const [fontStep, setFontStep] = useState(initialFont);
  const [resetMsg, setResetMsg] = useState("");

  useEffect(() => { if (theme === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { applyFontSize(fontStep); try { localStorage.setItem(FONT_KEY, fontStep); } catch { /* not remembered */ } }, [fontStep]);
  useEffect(() => { const on = () => setPage(pageFromHash()); window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  useEffect(() => {
    // P toggles presenter mode, Escape leaves it. Never while typing or on a control, never with a modifier (Ctrl+P prints), never on key repeat.
    const on = (e) => {
      const act = shortcutTarget(e);
      if (act === "toggle") setPresenter((v) => !v);
      else if (act === "leave") setPresenter(false);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const pickTheme = (next) => { try { if (next === "auto") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, next); } catch { /* not remembered */ } setTheme(next); };
  const select = (id) => { setPage(id); try { window.history.replaceState(null, "", `#${id}`); } catch { /* ignore */ } };
  const reset = async () => {
    const ok = await lab.reset();
    setResetMsg(ok ? "Reset: the key is back to its default inspector, enforcing and failing closed, the lab clock is at zero, the last run is cleared and the diagram is back in place." : "Reset failed on the server; the view was reloaded.");
  };

  const { source, story, info } = lab;
  const banner = info?.banner || BANNER_UNKNOWN;
  const View = PAGES.find((p) => p.id === page).View;
  const sc = lab.last?.scenario ? story?.stories.find((s) => s.scenario === lab.last.scenario.id) : null;
  const say = !story ? [] : page === "inspector" ? story.talkTrack.filter((x) => x.id === (sc ? sc.id : "before-you-start")) : story.talkTrack.filter((x) => (PRESENTER_TALK[page] || []).includes(x.id));

  return (
    <div className={`app${presenter ? " app--presenter" : ""}`}>
      <header className="shell-bar">
        <span className="shell-brand">
          <span className="shell-logo" aria-hidden="true">PMA</span>
          <h1>{visible(story?.name || "Privilege Model Armor LAB")}</h1>
          {source && <span className="shell-badge" data-testid="mode" title="Mock: nothing leaves this machine">{source === "real" ? "Real" : "Mock"}</span>}
        </span>
        <nav className="shell-nav" aria-label="Lab sections">
          {PAGES.map((p) => <a key={p.id} href={`#${p.id}`} aria-current={page === p.id ? "page" : undefined} onClick={(e) => { e.preventDefault(); select(p.id); }}>{p.label}</a>)}
        </nav>
        <TopMenu
          vertical={{ value: lab.vertical || "", onChange: lab.setVertical, options: story ? story.verticals.map((v) => v.id) : [] }}
          theme={{ value: theme, onChange: pickTheme }}
          fontSize={{ value: fontStep, onChange: setFontStep }}
          present={{ active: presenter, onToggle: () => setPresenter((v) => !v), label: "Presenter (P)" }}
          talkTrack={{ active: talkOpen, onToggle: () => setTalkOpen((v) => !v) }}
          help={{ href: "https://github.com/curtismu7/privilege-model-armor-LAB#readme" }}
          version={info?.version ? `v${info.version}` : null}
          onVersion={() => setAboutOpen((v) => !v)}
          onReset={reset}
          extra={<ModeToggle source={source || "mock"} info={info} onSwitch={lab.switchMode} />}
        />
      </header>
      <main className="page">
        <p className="banner" role="note" data-state={source === "real" ? "live" : "mock"} data-testid="banner">{banner}</p>
        {lab.forgotten && (
          <div className="reset-note" role="status" data-testid="workspace-forgotten">
            <p>The server forgot this workspace (it keeps a limited number, and a Reset from a terminal drops one too): the lab was reset to its defaults, and the key and the last result you had are gone.</p>
            <button type="button" onClick={lab.dismissForgotten} data-testid="workspace-forgotten-dismiss">Dismiss</button>
          </div>
        )}
        {lab.modeError && <p className="field-error" role="alert" data-testid="mode-error-banner">{lab.modeError}</p>}
        {lab.error && (
          <div className="field-error" role="alert" data-testid="load-error">
            <p>Could not load the lab ({lab.error}). Is the server running?</p>
            <button type="button" onClick={lab.reload} data-testid="retry">Try again</button>
          </div>
        )}
        <p className={resetMsg ? "reset-note" : "sr-only"} role="status" aria-live="polite" data-testid="reset-note">{resetMsg}</p>
        {!presenter && <div className="page-head"><p className="head__intro" data-testid="head-intro">{PAGE_INTRO[page]}</p></div>}
        {presenter && <PresenterSay say={say} heading={null} />}
        <div id={`panel-${page}`}>
          {lab.error && !story ? null : !story || !info ? <p className="muted" role="status">Loading...</p> : <View key={`${page}-${lab.epoch}`} lab={lab} />}
        </div>
      </main>
      <AboutDialog isOpen={aboutOpen} onClose={() => setAboutOpen(false)} info={info} version={info?.version ? `v${info.version}` : ""} />
      <TalkTrackDialog isOpen={talkOpen} onClose={() => setTalkOpen(false)} talk={story?.talkTrack ?? []} />
    </div>
  );
}
