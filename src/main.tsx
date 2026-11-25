import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/mona-sans/standard.css';
import '@fontsource/libre-caslon-text/latin-400.css';
import '@fontsource/libre-caslon-text/latin-400-italic.css';
import '@fontsource/libre-caslon-text/latin-700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/status.css';
import './styles/welcome.css';
import './styles/account.css';
import App from './App';
import { DataProvider } from './data/store';
import { PrefsProvider, usePrefs } from './lib/i18n';
import { AccountProvider, useAccount } from './lib/account';
import { Guide } from './components/Guide';
import { SignIn } from './components/Account';
import { About } from './components/About';
import { Welcome } from './components/Welcome';
import { roomFromUrl } from './lib/live';

// The "Skills" link on the case page (#/about) opens the About screen straight away; the address goes back to Today.
const aboutLink = location.hash === '#/about';
if (aboutLink) history.replaceState(null, '', location.pathname + location.search + '#/today');
// A phone joining a live session by QR code, and the "Try it on two devices" link, skip the welcome.
const direct = roomFromUrl() !== null || new URLSearchParams(location.search).has('live') || aboutLink;

// The app remounts when the language changes, so every string is worked out again; the data stays put.
function Root() {
  const { prefs } = usePrefs();
  const { account } = useAccount();
  // The full guide opens from the menu, the welcome card and the sign-in screen; a language switch keeps it open.
  const [guide, setGuide] = useState(false);
  const [about, setAbout] = useState(aboutLink);
  useEffect(() => {
    const on = () => setGuide(true);
    const ab = () => setAbout(true);
    window.addEventListener('wr:guide', on);
    window.addEventListener('wr:about', ab);
    return () => {
      window.removeEventListener('wr:guide', on);
      window.removeEventListener('wr:about', ab);
    };
  }, []);
  return (
    <>
      {account ? <App key={prefs.lang + account.role} /> : <SignIn key={prefs.lang} />}
      {/* first visit: the product is already on screen, with a small welcome card over it */}
      {account && !prefs.chosen && !direct && !guide && <Welcome key={prefs.lang} />}
      {guide && <Guide onClose={() => setGuide(false)} />}
      {about && <About key={prefs.lang} onClose={() => setAbout(false)} />}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrefsProvider>
      <AccountProvider>
        <DataProvider>
          <Root />
        </DataProvider>
      </AccountProvider>
    </PrefsProvider>
  </StrictMode>
);
