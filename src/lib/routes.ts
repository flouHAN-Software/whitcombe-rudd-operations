import type { IconName } from '../components/Icon';
import type { Key } from './strings';
import { STR } from './strings';
import { t } from './i18n';

export type RouteId = 'today' | 'jobs' | 'dispatch' | 'stock' | 'customers' | 'invoices' | 'reports' | 'field';

export interface RouteDef {
  id: RouteId;
  /** G ile başlayan kısayolun ikinci harfi */
  key: string;
  icon: IconName;
  label: Key;
  /** Komut menüsünde aramaya yardımcı kelimeler (iki dilde de aranır) */
  kw: Key;
}

export const ROUTES: RouteDef[] = [
  { id: 'today', key: 't', icon: 'today', label: 'nav.today', kw: 'kw.today' },
  { id: 'jobs', key: 'j', icon: 'jobs', label: 'nav.jobs', kw: 'kw.jobs' },
  { id: 'dispatch', key: 'd', icon: 'dispatch', label: 'nav.dispatch', kw: 'kw.dispatch' },
  { id: 'stock', key: 's', icon: 'stock', label: 'nav.stock', kw: 'kw.stock' },
  { id: 'customers', key: 'c', icon: 'customers', label: 'nav.customers', kw: 'kw.customers' },
  { id: 'invoices', key: 'i', icon: 'invoices', label: 'nav.invoices', kw: 'kw.invoices' },
  { id: 'reports', key: 'r', icon: 'reports', label: 'nav.reports', kw: 'kw.reports' },
  { id: 'field', key: 'e', icon: 'field', label: 'nav.field', kw: 'kw.field' }
];

export const MAIN_NAV: RouteId[] = ['today', 'jobs', 'dispatch', 'stock', 'customers', 'invoices', 'reports'];
export const MOBILE_TABS: RouteId[] = ['today', 'jobs', 'dispatch', 'stock'];

export const routeById = (id: RouteId) => ROUTES.find((r) => r.id === id)!;
export const routeLabel = (id: RouteId) => t(routeById(id).label);
/** Arama kelimeleri: iki dilin etiketleri ve anahtar kelimeleri birlikte */
export const routeWords = (r: RouteDef) => [...STR[r.label], ...STR[r.kw]].join(' ');
