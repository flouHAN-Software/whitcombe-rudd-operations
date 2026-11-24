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
import { roomFromUrl } from './lib/live';

// Karekodla canlı oturuma katılan cihaz (genelde telefon) ve vaka sayfasındaki "telefonda deneyin"
// bağlantısıyla gelen ziyaretçi rehbersiz, doğrudan işe başlar
const direct = roomFromUrl() !== null || new URLSearchParams(location.search).has('live');

// Dil değişince uygulama yeniden kurulur (bütün metinler yeni dilde hesaplanır); veri yerinde kalır
function Root() {
  const { prefs } = usePrefs();
  const { account } = useAccount();
  // Rehber: ilk girişte ve menüdeki "Nasıl kullanılır" ile açılır; dil değişince kapanmaz
  const [guide, setGuide] = useState(false);
  const [about, setAbout] = useState(false);
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
      {((!prefs.chosen && !direct) || guide) && <Guide onClose={() => setGuide(false)} />}
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
