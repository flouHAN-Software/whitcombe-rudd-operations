export type JobType = 'breakdown' | 'repair' | 'service' | 'landlord' | 'recall' | 'install' | 'survey' | 'appliance' | 'cooling';

export type JobStatus = 'unassigned' | 'booked' | 'en_route' | 'on_site' | 'waiting_parts' | 'on_hold' | 'done';

export type Trade = 'gas' | 'appliance' | 'cooling';

export interface Engineer {
  id: string;
  name: string;
  initials: string;
  skills: string;
  trade: Trade;
  /** Bugün çalışmıyorsa nedeni */
  off?: string;
}

export interface Customer {
  id: string;
  name: string;
  kind: 'household' | 'landlord' | 'business';
  /** Name on the dispatch board for firms with long names */
  short?: string;
  phone: string;
  since: number;
}

export interface Equipment {
  make: string;
  model: string;
  fitted?: number;
  extra?: string;
}

export interface Part {
  id: string;
  name: string;
  /** Birim maliyet, KDV hariç, peni cinsinden */
  cost: number;
  /** Depodaki adet */
  depot: number;
  /** Teknisyen kimliği → araçtaki adet */
  vans: Record<string, number>;
  /** Alt sınır: depo + araçlar bunun altına inerse sipariş gerekir */
  min: number;
  bin: string;
  supplier: string;
  order?: { qty: number; due: string; ref: string };
}

export interface JobPart {
  part: string;
  qty: number;
  state: 'used' | 'on_van' | 'at_depot' | 'ordered';
  due?: string;
}

export type EventKind = 'logged' | 'assigned' | 'text' | 'on_way' | 'arrived' | 'done' | 'note' | 'call' | 'hold' | 'part';

export interface JobEvent {
  /** "2026-11-23T10:21" */
  at: string;
  by: string;
  kind: EventKind;
  text: string;
}

export interface Job {
  id: string;
  type: JobType;
  title: string;
  /** Müşterinin anlattığı, ofisin yazdığı */
  detail: string;
  code?: string;
  equipment?: Equipment;
  customer: string;
  site: { line: string; area: string };
  contact?: string;
  access?: string;
  /** "2026-11-23"; henüz tarih yoksa null */
  date: string | null;
  /** Müşteriye söz verilen varış aralığı, dakika */
  window: [number, number] | null;
  /** Planlanan başlangıç ve süre, dakika */
  plan?: [number, number];
  engineer: string | null;
  status: JobStatus;
  eta?: number;
  arrived?: number;
  doneAt?: number;
  holdReason?: string;
  flags?: string[];
  parts?: JobPart[];
  source: 'Phone' | 'Website' | 'Agent portal' | 'Return visit';
  events: JobEvent[];
}

export interface InvoiceLine {
  text: string;
  qty: number;
  /** Birim fiyat, KDV hariç, peni */
  unit: number;
}

export type PayMethod = 'Card on site' | 'Card' | 'Bank transfer' | 'Cash';

export type InvoiceEventKind = 'created' | 'sent' | 'reminder' | 'payment' | 'failed' | 'paid' | 'note';

export interface InvoiceEvent {
  at: string;
  by: string;
  kind: InvoiceEventKind;
  text: string;
  /** Ödeme olaylarında tutar, KDV dahil, peni */
  amount?: number;
  method?: PayMethod;
}

export interface Invoice {
  id: string;
  customer: string;
  /** "WR-48188"; arşivdeki işler verinin içinde yoktur, bağlantısız gösterilir */
  job?: string;
  site?: string;
  issued: string;
  /** Vade tarihi; "on completion" için iş günü */
  due: string;
  /** 0 = teslimde, 7 ya da 30 gün */
  terms: number;
  lines: InvoiceLine[];
  /** Taslaksa gönderilmedi */
  sent?: string;
  events: InvoiceEvent[];
}

export interface Data {
  engineers: Engineer[];
  customers: Customer[];
  parts: Part[];
  jobs: Job[];
  invoices: Invoice[];
}
