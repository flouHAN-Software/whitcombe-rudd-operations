// Whitcombe & Rudd · tohum verisi. Kurgusal firma, kurgusal kişiler.
// Gün: Pazartesi 23 Kasım 2026, panel 10:34'ten başlar.
// Telefonlar yalnızca Ofcom'un dizi ve filmler için ayırdığı 07700 900000–900999 aralığından.
// Posta kodunun yalnızca ilk yarısı yazılır; kapı numaraları uydurmadır.
// Arıza kodları yalnızca kaynaktan doğrulananlar: Vaillant F.22/F.28/F.29, Worcester EA 227,
// Baxi E119, Bosch bulaşık makinesi E24, Samsung çamaşır makinesi 5E.
import type { Customer, Data, Engineer, EventKind, Invoice, InvoiceEventKind, Job, JobEvent, JobPart, JobStatus, JobType, Part, PayMethod } from './types';
import { addDays, daysBetween, draftFor, totalOf } from './billing';
import { TODAY } from './today';

const m = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const at = (min: number, date = TODAY) => `${date}T${hm(min)}`;

export const ENGINEERS: Engineer[] = [
  { id: 'dan', name: 'Dan Okafor', initials: 'DO', skills: 'Gas · boilers', trade: 'gas' },
  { id: 'sam', name: 'Sam Pryce', initials: 'SP', skills: 'Gas · landlord certificates', trade: 'gas' },
  { id: 'kasia', name: 'Kasia Nowak', initials: 'KN', skills: 'Gas · boilers', trade: 'gas' },
  { id: 'lee', name: 'Lee Hensley', initials: 'LH', skills: 'Gas · servicing', trade: 'gas' },
  { id: 'rhys', name: 'Rhys Morgan', initials: 'RM', skills: 'Gas · boilers', trade: 'gas' },
  { id: 'gemma', name: 'Gemma Hale', initials: 'GH', skills: 'Gas · landlord certificates', trade: 'gas' },
  { id: 'joel', name: 'Joel Tanner', initials: 'JT', skills: 'Gas · installs', trade: 'gas', off: 'Annual leave' },
  { id: 'marcus', name: 'Marcus Bell', initials: 'MB', skills: 'Laundry · dishwashers', trade: 'appliance' },
  { id: 'aled', name: 'Aled Rees', initials: 'AR', skills: 'Refrigeration · cooking', trade: 'appliance' },
  { id: 'chris', name: 'Chris Daw', initials: 'CD', skills: 'Cooking · laundry', trade: 'appliance' },
  { id: 'imran', name: 'Imran Shah', initials: 'IS', skills: 'Air conditioning · F-gas', trade: 'cooling' }
];

// Stok. Maliyet peni cinsinden, KDV hariç. Tedarikçiler kurgusal.
// İşlerle tutarlı: PRV-0061 depoda var, araçta yok (Rhys'in sorusu); FFM-0102 bugün takıldı, tükendi;
// DVV-0412 ve PCB-0907 siparişte, işlerdeki tarihlerle aynı.
const H = 'Harbourline Heating Supplies';
const A = 'Kelston Appliance Spares';
const C = 'Northcote Cooling';
export const PARTS: Part[] = [
  { id: 'IGN-0228', name: 'Ignition electrode, Vaillant ecoTEC plus', cost: 2874, depot: 2, vans: { dan: 1, kasia: 1 }, min: 3, bin: 'H2-04', supplier: H },
  { id: 'IGN-0231', name: 'Ignition electrode and lead, Glow-worm Energy', cost: 3412, depot: 1, vans: {}, min: 2, bin: 'H2-05', supplier: H },
  { id: 'GVV-0022', name: 'Gas valve, Worcester Greenstar i', cost: 11240, depot: 0, vans: {}, min: 1, bin: 'H1-02', supplier: H },
  { id: 'DVV-0412', name: 'Diverter valve cartridge, Worcester Greenstar i', cost: 6420, depot: 0, vans: {}, min: 1, bin: 'H1-03', supplier: H, order: { qty: 2, due: '2026-11-25', ref: 'PO-1187' } },
  { id: 'PCB-0907', name: 'Main PCB, Glow-worm Energy combi', cost: 21460, depot: 0, vans: {}, min: 0, bin: 'H1-08', supplier: H, order: { qty: 1, due: '2026-12-02', ref: 'PO-1179' } },
  { id: 'FAN-0310', name: 'Fan assembly, Ideal Logic', cost: 9870, depot: 1, vans: {}, min: 1, bin: 'H1-06', supplier: H },
  { id: 'PMP-0153', name: 'Circulating pump, Grundfos UPS2 15-60', cost: 14280, depot: 2, vans: {}, min: 3, bin: 'H1-01', supplier: H, order: { qty: 4, due: '2026-11-26', ref: 'PO-1190' } },
  { id: 'PRV-0061', name: 'Pressure relief valve, Baxi 600 Combi', cost: 2318, depot: 2, vans: {}, min: 2, bin: 'H2-11', supplier: H },
  { id: 'EXV-0080', name: 'Expansion vessel, 8 litre', cost: 3650, depot: 3, vans: {}, min: 2, bin: 'H3-02', supplier: H },
  { id: 'NTC-0140', name: 'NTC sensor, clip-on, 22 mm', cost: 1480, depot: 4, vans: { dan: 1, rhys: 1 }, min: 4, bin: 'H2-08', supplier: H },
  { id: 'AAV-0012', name: 'Automatic air vent, 1/2 in', cost: 640, depot: 18, vans: { dan: 2, kasia: 2, rhys: 2, lee: 1 }, min: 10, bin: 'H4-01', supplier: H },
  { id: 'FLL-0019', name: 'Filling loop, braided hose', cost: 1190, depot: 6, vans: { lee: 1, kasia: 1 }, min: 6, bin: 'H4-03', supplier: H },
  { id: 'TRV-0034', name: 'Thermostatic radiator valve, 15 mm', cost: 1295, depot: 14, vans: { dan: 3, kasia: 2, rhys: 2, lee: 2 }, min: 12, bin: 'H4-06', supplier: H },
  { id: 'FIT-0022', name: 'Compression elbow, 22 mm', cost: 386, depot: 60, vans: { dan: 8, sam: 10, kasia: 6, lee: 6, rhys: 8, gemma: 6 }, min: 40, bin: 'H5-02', supplier: H },
  { id: 'MAG-0118', name: 'Magnetic system filter, 22 mm', cost: 8950, depot: 3, vans: { rhys: 1, joel: 1 }, min: 3, bin: 'H3-05', supplier: H },
  { id: 'INH-0050', name: 'Central heating inhibitor, 500 ml', cost: 1120, depot: 24, vans: { lee: 3, sam: 2, gemma: 2 }, min: 20, bin: 'H5-07', supplier: H },
  { id: 'COA-0011', name: 'Carbon monoxide alarm, sealed 10-year battery', cost: 1940, depot: 5, vans: { lee: 1, gemma: 2, sam: 1 }, min: 6, bin: 'H5-10', supplier: H },
  { id: 'GFR-0040', name: 'Gas fire, glass-fronted, 3.4 kW', cost: 38900, depot: 0, vans: { gemma: 1 }, min: 0, bin: 'Bay 2', supplier: H },
  { id: 'DBL-0731', name: 'Door seal, Hotpoint front loader', cost: 3168, depot: 1, vans: { marcus: 1 }, min: 2, bin: 'A1-02', supplier: A },
  { id: 'DRP-0517', name: 'Drain pump, washing machine, universal', cost: 2450, depot: 4, vans: { marcus: 2, chris: 1 }, min: 4, bin: 'A1-04', supplier: A },
  { id: 'HTR-0206', name: 'Heater element, washing machine, 2000 W', cost: 2120, depot: 2, vans: {}, min: 3, bin: 'A1-06', supplier: A },
  { id: 'CBR-0090', name: 'Motor carbon brushes, pair', cost: 890, depot: 10, vans: { marcus: 2, chris: 2 }, min: 6, bin: 'A1-09', supplier: A },
  { id: 'BRG-0112', name: 'Drum bearing and seal kit, Samsung', cost: 4380, depot: 1, vans: {}, min: 1, bin: 'A2-01', supplier: A },
  { id: 'DWP-0233', name: 'Drain pump, Bosch dishwasher', cost: 3480, depot: 2, vans: { marcus: 1 }, min: 2, bin: 'A2-04', supplier: A },
  { id: 'FFM-0102', name: 'Fridge fan motor, Beko', cost: 2245, depot: 0, vans: {}, min: 1, bin: 'A3-01', supplier: A },
  { id: 'THM-0310', name: 'Fridge thermostat, universal', cost: 1640, depot: 3, vans: { aled: 1 }, min: 2, bin: 'A3-03', supplier: A },
  { id: 'OVE-0612', name: 'Fan oven element, 2500 W', cost: 2690, depot: 3, vans: { aled: 1, chris: 1 }, min: 3, bin: 'A4-02', supplier: A },
  { id: 'THS-0215', name: 'Oven thermostat, Rangemaster', cost: 4875, depot: 0, vans: { chris: 1 }, min: 1, bin: 'A4-05', supplier: A },
  { id: 'ELM-0330', name: 'Oven element, Rangemaster main oven', cost: 3990, depot: 1, vans: { chris: 1 }, min: 1, bin: 'A4-06', supplier: A },
  { id: 'RGS-0032', name: 'R32 refrigerant, 9 kg cylinder', cost: 9600, depot: 2, vans: { imran: 1 }, min: 2, bin: 'Cage', supplier: C },
  { id: 'FLT-0029', name: 'Filter set, wall-mounted split unit', cost: 1850, depot: 9, vans: { imran: 6 }, min: 8, bin: 'C1-02', supplier: C }
];

type Note = [string, string, EventKind, string];
interface Spec {
  id: string;
  type: JobType;
  title: string;
  detail: string;
  code?: string;
  eq?: [string, string, number?, string?];
  cust: [string, Customer['kind'], number];
  site: [string, string];
  contact?: string;
  access?: string;
  date?: string | null;
  win?: [string, string] | null;
  plan?: [string, number];
  eng?: string;
  status: JobStatus;
  onWay?: string;
  eta?: string;
  arrived?: string;
  done?: string;
  doneNote?: string;
  hold?: string;
  flags?: string[];
  parts?: [string, number, JobPart['state'], string?][];
  log: [string, string, Job['source']];
  assigned?: string;
  notes?: Note[];
}

const S: Spec[] = [
  // ——— Dan Okafor ———
  {
    id: '48188', type: 'service', title: 'Annual boiler service',
    detail: 'Annual service. Customer says the boiler is louder than usual on start-up.',
    eq: ['Worcester Bosch', 'Greenstar 25Si', 2016], cust: ['Priya and Tom Ashdown', 'household', 2016],
    site: ['27 Sefton Park Road', 'BS7'], win: ['08:00', '10:00'], plan: ['08:00', 50], eng: 'dan',
    status: 'done', arrived: '08:06', done: '08:47',
    doneNote: 'Service complete, flue gas reading normal. Fan bearing noisy: advised replacement within 12 months, quote to follow.',
    log: ['2026-10-26T09:14', 'Becky Lane', 'Phone']
  },
  {
    id: '48207', type: 'breakdown', title: 'No heating or hot water',
    detail: 'No heating or hot water since Saturday evening. Display shows F.28. Customer has reset it twice; it tries to light and gives up.',
    code: 'F.28', eq: ['Vaillant', 'ecoTEC plus 832', 2018], cust: ['Ffion Llewellyn-Hughes', 'household', 2021],
    site: ['14 Cotham Vale', 'BS6'], win: ['08:00', '10:00'], plan: ['09:15', 90], eng: 'dan',
    status: 'en_route', onWay: '10:21', eta: '10:50', assigned: '2026-11-23T08:03',
    flags: ['Two children under 5 in the house'],
    parts: [['IGN-0228', 1, 'on_van']],
    log: ['2026-11-22T18:12', 'Website', 'Website'],
    notes: [
      ['2026-11-23T07:58', 'Becky Lane', 'call', 'Called back. Two children under 5, marked as priority and booked into the first slot.'],
      ['2026-11-23T09:04', 'Dan Okafor', 'note', 'Ignition electrode not on the van. Collecting one from the depot first.'],
      ['2026-11-23T09:58', 'Becky Lane', 'call', 'Rang Ffion: running late because of the part. She is in all day.']
    ]
  },
  {
    id: '48216', type: 'survey', title: 'Survey for a new combi',
    detail: 'Wants a quote to replace a 1990s back boiler with a combi. The gas fire in front of it is coming out too.',
    eq: ['Baxi', 'Bermuda back boiler', 1994], cust: ['Hannah Price', 'household', 2026],
    site: ['8 Raleigh Road', 'BS3'], win: ['11:00', '13:00'], plan: ['11:45', 45], eng: 'dan', status: 'booked',
    log: ['2026-11-17T12:40', 'Becky Lane', 'Phone']
  },
  {
    id: '48222', type: 'repair', title: 'Replace three radiator valves',
    detail: 'Three radiator valves seized in the front rooms. Quote accepted on 12 Nov.',
    cust: ['Chidi Okonjo', 'household', 2019], site: ['41 Greenbank Road', 'BS5'],
    win: ['13:00', '15:00'], plan: ['13:15', 90], eng: 'dan', status: 'booked',
    parts: [['TRV-0034', 3, 'on_van']],
    log: ['2026-11-12T15:22', 'Ellie Whitcombe', 'Phone']
  },
  {
    id: '48230', type: 'breakdown', title: 'Pressure keeps dropping',
    detail: 'Pressure falls to zero every two or three days, E119 on the display. Customer is topping it up herself with the filling loop.',
    code: 'E119', eq: ['Baxi', '600 Combi', 2019], cust: ['Margaret Doyle', 'household', 2012],
    site: ['5 Seymour Road', 'BS7'], win: ['15:00', '17:00'], plan: ['15:30', 60], eng: 'dan', status: 'booked',
    log: ['2026-11-20T11:05', 'Becky Lane', 'Phone']
  },

  // ——— Sam Pryce ———
  {
    id: '48185', type: 'landlord', title: 'Landlord gas safety record',
    detail: 'Annual gas safety record: boiler and hob.',
    eq: ['Ideal', 'Logic+ C24', 2020, 'gas hob'], cust: ['Harbourside Lettings', 'landlord', 2009],
    site: ['Flat 1, 14 Zetland Road', 'BS6'], contact: 'Tenant: Ola Adeyemi',
    win: ['08:00', '10:00'], plan: ['08:00', 80], eng: 'sam', status: 'done', arrived: '08:04', done: '09:22',
    doneNote: 'Gas safety record issued. Boiler and hob pass. Copy emailed to the agent.',
    log: ['2026-11-02T10:30', 'Agent portal', 'Agent portal']
  },
  {
    id: '48211', type: 'landlord', title: 'Landlord gas safety record',
    detail: 'Annual gas safety record: boiler and two gas fires (living room, front bedroom).',
    eq: ['Baxi', '800 Combi 2', 2019, '2 gas fires'], cust: ['Harbourside Lettings', 'landlord', 2009],
    site: ['Flat 3, 61 Ashley Down Road', 'BS7'], contact: 'Tenant: Rory Quinn',
    access: "Tenant works nights. Knock, don't ring. Key safe at the side gate, code from the office.",
    win: ['10:00', '12:00'], plan: ['10:45', 75], eng: 'sam', status: 'en_route', onWay: '10:29', eta: '10:52',
    log: ['2026-11-04T09:12', 'Agent portal', 'Agent portal']
  },
  {
    id: '48224', type: 'breakdown', title: 'Leak under the boiler',
    detail: 'Drip from the flow pipe under the boiler, bowl underneath. Pressure holding at 1 bar.',
    eq: ['Ideal', 'Logic+ C30', 2017], cust: ['Rob Hollins', 'household', 2017],
    site: ['112 Filton Avenue', 'BS7'], win: ['12:00', '14:00'], plan: ['12:45', 60], eng: 'sam', status: 'booked',
    parts: [['FIT-0022', 2, 'on_van']],
    log: ['2026-11-22T20:41', 'Website', 'Website'],
    notes: [['2026-11-23T08:20', 'Becky Lane', 'note', 'Sam: take 22 mm compression fittings, sounds like a joint on the flow.']]
  },
  {
    id: '48231', type: 'landlord', title: 'Landlord gas safety record',
    detail: 'Annual gas safety record: boiler only. Agent meets the engineer with keys.',
    eq: ['Vaillant', 'ecoTEC pro 28', 2015], cust: ['Clifton Property Management', 'landlord', 2014],
    site: ['Flat 2, 9 Hotwells Road', 'BS8'], contact: 'Agent: Tess Moran meets you there',
    win: ['14:00', '16:00'], plan: ['14:30', 60], eng: 'sam', status: 'booked',
    log: ['2026-11-09T14:02', 'Agent portal', 'Agent portal']
  },
  {
    id: '48236', type: 'service', title: 'Annual boiler service',
    detail: 'Annual service. Parking is tight; customer will leave the drive free.',
    eq: ['Viessmann', 'Vitodens 100-W', 2021], cust: ['Grace Mensah', 'household', 2021],
    site: ['19 Henleaze Road', 'BS9'], win: ['16:00', '18:00'], plan: ['16:15', 45], eng: 'sam', status: 'booked',
    log: ['2026-10-30T16:48', 'Website', 'Website']
  },

  // ——— Kasia Nowak ———
  {
    id: '48189', type: 'breakdown', title: 'Boiler keeps cutting out',
    detail: 'Boiler lights then cuts out after a few minutes, F.29 on the display.',
    code: 'F.29', eq: ['Vaillant', 'ecoTEC pro 24', 2017], cust: ['Owen Pritchard', 'household', 2018],
    site: ['73 Coronation Road', 'BS3'], win: ['08:00', '10:00'], plan: ['08:00', 80], eng: 'kasia',
    status: 'done', arrived: '08:09', done: '09:18',
    doneNote: 'Condensate trap blocked with debris, cleaned and refitted. Ran on test for 20 minutes without a lockout.',
    log: ['2026-11-21T08:55', 'Becky Lane', 'Phone']
  },
  {
    id: '48209', type: 'breakdown', title: 'Radiators cold upstairs, pipes banging',
    detail: 'Upstairs radiators cold, loud banging from the airing cupboard when the heating comes on.',
    eq: ['Ideal', 'Vogue C32', 2019], cust: ['Lucy Fairbairn', 'household', 2019],
    site: ['6 Redland Road', 'BS6'], win: ['10:00', '12:00'], plan: ['10:00', 90], eng: 'kasia',
    status: 'on_site', arrived: '10:08',
    log: ['2026-11-21T19:30', 'Website', 'Website']
  },
  {
    id: '48226', type: 'service', title: 'Annual boiler service',
    detail: 'Annual service, last done November 2025.',
    eq: ['Vaillant', 'ecoTEC plus 825', 2020], cust: ['Ahmed and Sara Karimi', 'household', 2020],
    site: ['30 Coldharbour Road', 'BS6'], win: ['12:00', '14:00'], plan: ['12:30', 50], eng: 'kasia', status: 'booked',
    log: ['2026-11-03T10:11', 'Becky Lane', 'Phone']
  },
  {
    id: '48233', type: 'breakdown', title: "Boiler won't light",
    detail: 'Fails to light, EA 227 on the display. New gas meter fitted by the supplier on Friday.',
    code: 'EA 227', eq: ['Worcester Bosch', 'Greenstar 4000 30kW', 2022], cust: ['Dennis Afolabi', 'household', 2022],
    site: ['204 Muller Road', 'BS7'], win: ['14:00', '16:00'], plan: ['14:30', 75], eng: 'kasia', status: 'booked',
    log: ['2026-11-23T08:41', 'Becky Lane', 'Phone']
  },

  // ——— Lee Hensley ———
  {
    id: '48190', type: 'service', title: 'Annual boiler service',
    detail: 'Annual service.',
    eq: ['Ideal', 'Logic+ C30', 2018], cust: ['Ben and Hattie Sutherland', 'household', 2018],
    site: ['3 Belvoir Road', 'BS6'], win: ['08:00', '10:00'], plan: ['08:30', 60], eng: 'lee',
    status: 'done', arrived: '08:34', done: '09:41', doneNote: 'Service complete. Topped up pressure to 1.2 bar.',
    log: ['2026-10-28T13:20', 'Website', 'Website']
  },
  {
    id: '48204', type: 'service', title: 'Annual boiler service',
    detail: 'Annual service. Dog in the house, will be kept in the kitchen.',
    eq: ['Worcester Bosch', 'Greenstar 30i', 2016], cust: ['Siobhán Kearney', 'household', 2016],
    site: ['58 Cranbrook Road', 'BS6'], win: ['10:00', '12:00'], plan: ['10:00', 60], eng: 'lee',
    status: 'on_site', arrived: '10:02',
    log: ['2026-11-05T11:47', 'Becky Lane', 'Phone']
  },
  {
    id: '48217', type: 'service', title: 'Annual boiler service',
    detail: 'Annual service.',
    eq: ['Baxi', '800 Combi', 2021], cust: ['Graham and June Tilley', 'household', 2003],
    site: ['15 Kings Drive', 'BS7'], win: ['12:00', '14:00'], plan: ['12:00', 60], eng: 'lee', status: 'booked',
    log: ['2026-11-06T09:30', 'Becky Lane', 'Phone']
  },
  {
    id: '48228', type: 'service', title: 'Annual service and CO alarm',
    detail: 'Annual service. Also wants a carbon monoxide alarm fitted in the hall.',
    eq: ['Alpha', 'E-Tec 28', 2014], cust: ['Nadia Haddad', 'household', 2014],
    site: ['2 Picton Street', 'BS6'], win: ['14:00', '16:00'], plan: ['14:00', 60], eng: 'lee', status: 'booked',
    parts: [['COA-0011', 1, 'on_van']],
    log: ['2026-11-10T17:02', 'Website', 'Website']
  },
  {
    id: '48235', type: 'service', title: 'Annual boiler service',
    detail: 'Annual service.',
    eq: ['Vaillant', 'ecoTEC plus 832', 2017], cust: ['Joan Whitlock', 'household', 2008],
    site: ['47 Westbury Road', 'BS9'], win: ['16:00', '18:00'], plan: ['16:00', 60], eng: 'lee', status: 'booked',
    flags: ['Customer is 87 and lives alone. Her daughter Clare wants a call when the engineer is on the way.'],
    log: ['2026-11-11T10:15', 'Becky Lane', 'Phone']
  },

  // ——— Rhys Morgan ———
  {
    id: '48191', type: 'breakdown', title: 'Boiler locks out on start-up',
    detail: 'Locks out on start-up, reset light flashing. Works for a while after a reset.',
    eq: ['Glow-worm', 'Energy 30c', 2017], cust: ['Gareth and Mel Price', 'household', 2017],
    site: ['12 Henleaze Gardens', 'BS9'], win: ['08:00', '10:00'], plan: ['08:00', 90], eng: 'rhys',
    status: 'done', arrived: '08:11', done: '09:50',
    doneNote: 'Replaced ignition electrode and lead. Six start-ups without a lockout.',
    parts: [['IGN-0231', 1, 'used']],
    log: ['2026-11-22T09:20', 'Website', 'Website']
  },
  {
    id: '48206', type: 'repair', title: 'Pressure relief valve dripping outside',
    detail: 'Pipe on the outside wall dripping constantly. Pressure reads 3.2 bar when the heating is on.',
    eq: ['Baxi', '600 Combi', 2018], cust: ['Kofi Boateng', 'household', 2018],
    site: ['150 Stapleton Road', 'BS5'], win: ['10:00', '12:00'], plan: ['10:10', 80], eng: 'rhys',
    status: 'on_site', arrived: '10:15',
    parts: [['PRV-0061', 1, 'at_depot']],
    log: ['2026-11-20T15:35', 'Becky Lane', 'Phone'],
    notes: [['2026-11-23T10:29', 'Rhys Morgan', 'note', 'Relief valve confirmed, expansion vessel flat as well. No PRV on my van. Can someone bring one from the depot, or do I rebook?']]
  },
  {
    id: '48221', type: 'breakdown', title: 'Pressure keeps dropping',
    detail: 'Repressurised twice this week. F.22 this morning. No visible leaks inside.',
    code: 'F.22', eq: ['Vaillant', 'ecoTEC plus 825', 2019], cust: ['Sheila Pask', 'household', 2015],
    site: ['7 Ashley Hill', 'BS6'], win: ['12:00', '14:00'], plan: ['12:30', 75], eng: 'rhys', status: 'booked',
    log: ['2026-11-23T08:12', 'Becky Lane', 'Phone']
  },
  {
    id: '48234', type: 'install', title: 'Fit a magnetic system filter',
    detail: 'Follow-up to the system flush on 10 Nov. Filter on the return under the boiler.',
    eq: ['Worcester Bosch', 'Greenstar 30i', 2015], cust: ['Tom Ferris', 'household', 2015],
    site: ['17 Dean Lane', 'BS3'], win: ['14:00', '16:00'], plan: ['15:00', 75], eng: 'rhys', status: 'booked',
    parts: [['MAG-0118', 1, 'on_van']],
    log: ['2026-11-10T16:50', 'Ellie Whitcombe', 'Phone']
  },

  // ——— Gemma Hale ———
  {
    id: '48184', type: 'landlord', title: 'Landlord gas safety record',
    detail: 'Five-bed student house: boiler, hob and one gas fire.',
    eq: ['Worcester Bosch', 'Greenstar 30CDi', 2011, 'hob, gas fire'], cust: ['Avonside Student Lets', 'landlord', 2013],
    site: ['31 Kingsdown Parade', 'BS6'], contact: 'Tenant: Jas Bhatti',
    win: ['08:00', '10:00'], plan: ['08:00', 75], eng: 'gemma', status: 'done', arrived: '08:03', done: '09:12',
    doneNote: 'Record issued. Gas fire passes, but the flue spigot is worn; advised the landlord to replace within the year.',
    log: ['2026-11-01T12:00', 'Agent portal', 'Agent portal']
  },
  {
    id: '48202', type: 'landlord', title: 'Landlord gas safety record',
    detail: 'Annual gas safety record: boiler and hob.',
    eq: ['Vaillant', 'ecoTEC plus 825', 2018, 'gas hob'], cust: ['Clifton Property Management', 'landlord', 2014],
    site: ['Flat 1, 44 Jacobs Wells Road', 'BS8'], contact: 'Tenant: Marta Silva',
    win: ['08:00', '12:00'], plan: ['09:30', 60], eng: 'gemma', status: 'done', arrived: '09:31', done: '10:25',
    doneNote: 'Record issued. All appliances pass.',
    log: ['2026-11-03T08:45', 'Agent portal', 'Agent portal']
  },
  {
    id: '48212', type: 'recall', title: 'Replace gas fire left At Risk',
    detail: 'Gas fire classified At Risk on 9 Nov and turned off with the tenant\'s agreement. Landlord approved a replacement; new fire is on Gemma\'s van.',
    eq: ['Valor', 'gas fire', 2006], cust: ['Harbourside Lettings', 'landlord', 2009],
    site: ['Flat 2, 14 Zetland Road', 'BS6'], contact: 'Tenant: Wes Carter',
    win: ['11:00', '13:00'], plan: ['11:00', 120], eng: 'gemma', status: 'booked',
    parts: [['GFR-0040', 1, 'on_van']],
    log: ['2026-11-13T10:05', 'Ellie Whitcombe', 'Return visit']
  },
  {
    id: '48225', type: 'landlord', title: 'Landlord gas safety record',
    detail: 'Six-bed student house: boiler and hob.',
    eq: ['Baxi', '800 Combi 2', 2020, 'gas hob'], cust: ['Avonside Student Lets', 'landlord', 2013],
    site: ['18 Cotham Road', 'BS6'], contact: 'Tenant: Freddie Lowe',
    win: ['14:00', '16:00'], plan: ['14:00', 60], eng: 'gemma', status: 'booked',
    log: ['2026-11-01T12:04', 'Agent portal', 'Agent portal']
  },

  // ——— Marcus Bell ———
  {
    id: '48186', type: 'appliance', title: 'Dishwasher not draining',
    detail: 'Water left in the bottom after every cycle, E24 on the display.',
    code: 'E24', eq: ['Bosch', 'Serie 4 dishwasher', 2020], cust: ['Ellen Carver', 'household', 2023],
    site: ['10 Berkeley Road', 'BS7'], win: ['08:00', '10:00'], plan: ['08:15', 45], eng: 'marcus',
    status: 'done', arrived: '08:19', done: '09:05',
    doneNote: 'Drain filter and sump cleared (a cherry stone and broken glass). Ran a full cycle, drains fine.',
    log: ['2026-11-22T10:02', 'Website', 'Website']
  },
  {
    id: '48201', type: 'appliance', title: 'Washer stops with water in the drum',
    detail: 'Stops mid-cycle with water in the drum, 5E on the display.',
    code: '5E', eq: ['Samsung', 'WW90T washing machine', 2021], cust: ['Kieran Walsh', 'household', 2024],
    site: ['388 Fishponds Road', 'BS5'], win: ['10:00', '12:00'], plan: ['10:00', 60], eng: 'marcus',
    status: 'on_site', arrived: '10:31',
    log: ['2026-11-21T13:44', 'Becky Lane', 'Phone']
  },
  {
    id: '48220', type: 'appliance', title: 'Washer leaking from the door',
    detail: 'Leaks from the bottom of the door during the wash. Customer has spotted a split in the seal.',
    eq: ['Hotpoint', 'washing machine', 2019], cust: ['Amira Yusuf', 'household', 2022],
    site: ['61 Two Mile Hill Road', 'BS15'], win: ['12:00', '14:00'], plan: ['12:30', 60], eng: 'marcus', status: 'booked',
    parts: [['DBL-0731', 1, 'on_van']],
    log: ['2026-11-19T18:21', 'Website', 'Website']
  },
  {
    id: '48229', type: 'appliance', title: 'Washer-dryer not drying',
    detail: 'Washes fine, clothes still damp after the drying programme.',
    eq: ['LG', 'washer-dryer', 2020], cust: ['Callum Reid', 'household', 2025],
    site: ['9 Station Road', 'BS16'], win: ['14:00', '16:00'], plan: ['14:15', 60], eng: 'marcus', status: 'booked',
    log: ['2026-11-20T09:58', 'Becky Lane', 'Phone']
  },
  {
    id: '48237', type: 'appliance', title: 'Dishwasher leaves grit on dishes',
    detail: 'Gritty film on glasses and plates for about two weeks.',
    eq: ['Miele', 'dishwasher', 2018], cust: ['Bethan Lloyd', 'household', 2018],
    site: ['140 Downend Road', 'BS16'], win: ['16:00', '18:00'], plan: ['16:00', 45], eng: 'marcus', status: 'booked',
    log: ['2026-11-18T12:30', 'Website', 'Website']
  },

  // ——— Aled Rees ———
  {
    id: '48187', type: 'appliance', title: 'Fridge warm, freezer fine',
    detail: 'Fridge section at room temperature, freezer still freezing.',
    eq: ['Beko', 'fridge freezer', 2020], cust: ['Pauline Archer', 'household', 2020],
    site: ['230 Wells Road', 'BS4'], win: ['08:00', '10:00'], plan: ['08:00', 75], eng: 'aled',
    status: 'done', arrived: '08:12', done: '09:34',
    doneNote: 'Fridge fan motor seized, replaced. Fridge down to 5 °C after 40 minutes.',
    parts: [['FFM-0102', 1, 'used']],
    log: ['2026-11-22T08:15', 'Website', 'Website']
  },
  {
    id: '48205', type: 'appliance', title: 'Fan oven not heating',
    detail: 'Fan runs, oven stays cold. Top oven and grill work.',
    eq: ['Neff', 'Slide&Hide oven', 2017], cust: ['Daniel Szabo', 'household', 2021],
    site: ['77 Bath Road', 'BS4'], win: ['10:00', '12:00'], plan: ['10:45', 60], eng: 'aled',
    status: 'en_route', onWay: '10:30', eta: '10:48',
    parts: [['OVE-0612', 1, 'on_van']],
    log: ['2026-11-20T19:02', 'Website', 'Website']
  },
  {
    id: '48218', type: 'appliance', title: 'Freezer icing up',
    detail: 'Thick ice on the back wall of the freezer, door not closing properly.',
    eq: ['Samsung', 'RB38 fridge freezer', 2019], cust: ['Yusuf Demir', 'household', 2024],
    site: ["19 St John's Lane", 'BS3'], win: ['12:00', '14:00'], plan: ['12:15', 60], eng: 'aled', status: 'booked',
    log: ['2026-11-21T11:27', 'Becky Lane', 'Phone']
  },
  {
    id: '48232', type: 'appliance', title: 'Induction hob: one zone dead',
    detail: 'Front left zone shows no power. Other three work.',
    eq: ['Bosch', 'induction hob', 2021], cust: ['Clare Whitfield', 'household', 2021],
    site: ['25 Kingsdown Parade', 'BS6'], win: ['14:00', '16:00'], plan: ['14:00', 60], eng: 'aled', status: 'booked',
    log: ['2026-11-19T14:10', 'Becky Lane', 'Phone']
  },

  // ——— Chris Daw ———
  {
    id: '48194', type: 'appliance', title: 'Range cooker main oven not heating',
    detail: 'Main oven stays cold, small oven and hob fine.',
    eq: ['Rangemaster', 'Classic 110', 2015], cust: ['Jill Ashworth', 'household', 2015],
    site: ['4 Belgrave Road', 'BS8'], win: ['08:00', '10:00'], plan: ['08:15', 90], eng: 'chris',
    status: 'on_site', arrived: '08:20',
    parts: [['THS-0215', 1, 'on_van'], ['ELM-0330', 1, 'on_van']],
    log: ['2026-11-18T09:40', 'Becky Lane', 'Phone'],
    notes: [['2026-11-23T09:40', 'Chris Daw', 'note', 'Thermostat and element both gone. Have both on the van, about another 45 minutes.']]
  },
  {
    id: '48208', type: 'appliance', title: 'Tumble dryer not heating',
    detail: 'Drum turns, no heat. Error light on after 20 minutes.',
    eq: ['Bosch', 'Serie 4 heat pump dryer', 2022], cust: ['Ruth Kendall', 'household', 2022],
    site: ['52 Cotham Brow', 'BS6'], win: ['10:00', '12:00'], plan: ['10:00', 60], eng: 'chris', status: 'booked',
    log: ['2026-11-19T16:05', 'Website', 'Website']
  },
  {
    id: '48223', type: 'appliance', title: 'Grill not working',
    detail: 'Top oven fine, grill element does not glow.',
    eq: ['Neff', 'double oven', 2016], cust: ["Patrick O'Neill", 'household', 2016],
    site: ['63 Cheltenham Road', 'BS6'], win: ['12:00', '14:00'], plan: ['12:30', 45], eng: 'chris', status: 'booked',
    log: ['2026-11-20T10:44', 'Becky Lane', 'Phone']
  },
  {
    id: '48238', type: 'appliance', title: "Washing machine drum won't turn",
    detail: 'Fills and drains, drum does not move. Burning smell once last week.',
    eq: ['Hotpoint', 'washing machine', 2016], cust: ['Erin Doherty', 'household', 2020],
    site: ['11 Brynland Avenue', 'BS7'], win: ['14:00', '16:00'], plan: ['14:15', 60], eng: 'chris', status: 'booked',
    log: ['2026-11-22T21:13', 'Website', 'Website']
  },

  // ——— Imran Shah ———
  {
    id: '48192', type: 'cooling', title: 'Annual service, three wall units',
    detail: 'Annual service and filter clean on three wall units: two surgeries and reception.',
    eq: ['Mitsubishi Electric', 'wall-mounted split units', 2020, '3 units'], cust: ['Gloucester Road Dental Practice', 'business', 2020],
    site: ['201 Gloucester Road', 'BS7'], contact: 'Practice manager: Helen Cho',
    access: 'Surgeries free from 08:00 to 09:00 only. Reception unit any time.',
    win: ['08:00', '10:00'], plan: ['08:00', 130], eng: 'imran', status: 'done', arrived: '07:58', done: '10:12',
    doneNote: 'All three units serviced. Surgery 2 drain line was slow; flushed.',
    log: ['2026-10-14T11:00', 'Ellie Whitcombe', 'Phone']
  },
  {
    id: '48210', type: 'cooling', title: 'Comms cupboard unit not cooling',
    detail: 'Unit in the server cupboard blowing warm air, error light flashing. Cupboard at 31 °C.',
    eq: ['Daikin', 'wall-mounted split unit', 2019], cust: ['Kestrel Print Studio', 'business', 2019],
    site: ['96 North Street', 'BS3'], contact: 'Office manager: Sian Hughes',
    win: ['11:00', '13:00'], plan: ['11:00', 90], eng: 'imran', status: 'booked',
    flags: ['Server cupboard at 31 °C. Door propped open with a desk fan on it for now.'],
    log: ['2026-11-23T08:37', 'Becky Lane', 'Phone']
  },
  {
    id: '48227', type: 'survey', title: 'Air conditioning for a garden office',
    detail: 'Wants cooling and heating for a 3 × 4 m garden office. Power already run from the house.',
    cust: ['Leah Marsh', 'household', 2026], site: ['88 Whiteladies Road', 'BS8'],
    win: ['14:00', '16:00'], plan: ['14:30', 45], eng: 'imran', status: 'booked',
    log: ['2026-11-16T20:05', 'Website', 'Website']
  },

  // ——— Atanmamış (tepsi) ———
  {
    id: '48214', type: 'appliance', title: "Washer won't drain",
    detail: 'Stops with water in the drum. Customer cleaned the pump filter, no change.',
    eq: ['Bosch', 'Serie 6 washing machine', 2020], cust: ['Tomasz Wiśniewski', 'household', 2023],
    site: ['7 Chandos Road', 'BS6'], win: ['12:00', '14:00'], status: 'unassigned',
    log: ['2026-11-22T19:48', 'Website', 'Website']
  },
  {
    id: '48219', type: 'appliance', title: 'Fridge-freezer not cooling',
    detail: 'Both sections warm since last night. Food moved to a neighbour.',
    eq: ['Hisense', 'fridge freezer', 2021], cust: ['Lena Fischer', 'household', 2025],
    site: ['52 Station Road', 'BS16'], win: ['14:00', '16:00'], status: 'unassigned',
    log: ['2026-11-23T07:46', 'Website', 'Website']
  },
  {
    id: '48239', type: 'breakdown', title: 'No heating',
    detail: 'No heating since this morning, hot water still works. Customer could not read the display.',
    eq: ['Worcester Bosch', 'Greenstar 24i', 2013], cust: ['Arthur Penrose', 'household', 2005],
    site: ['6 Wellington Hill West', 'BS9'], contact: 'Son: Mark Penrose, on his way over',
    win: null, status: 'unassigned',
    flags: ['Customer is 92. Using an electric heater for now.'],
    log: ['2026-11-23T10:22', 'Becky Lane', 'Phone']
  },
  {
    id: '48241', type: 'service', title: 'Annual boiler service',
    detail: 'Annual service. Would like a Saturday if possible.',
    eq: ['Vaillant', 'ecoTEC plus 832', 2020], cust: ['Rosa Lindqvist', 'household', 2020],
    site: ['14 Effingham Road', 'BS6'], date: null, win: null, status: 'unassigned',
    log: ['2026-11-23T09:15', 'Website', 'Website']
  },

  // ——— Parça bekleyen ———
  {
    id: '48198', type: 'breakdown', title: 'Hot water only, no heating',
    detail: 'Diagnosed on 20 Nov: diverter valve cartridge sticking. Part ordered, visit booked for Thursday.',
    eq: ['Worcester Bosch', 'Greenstar 30i', 2016], cust: ['Margaret Oyelaran', 'household', 2016],
    site: ['22 Elmgrove Road', 'BS6'], date: '2026-11-26', win: ['08:00', '10:00'], plan: ['08:00', 75], eng: 'kasia',
    status: 'waiting_parts', parts: [['DVV-0412', 1, 'ordered', '2026-11-25']],
    log: ['2026-11-19T17:30', 'Website', 'Website'],
    notes: [
      ['2026-11-20T11:05', 'Kasia Nowak', 'note', 'Diverter valve cartridge sticking. Not on the van; ordered. Customer happy with hot water only until Thursday.'],
      ['2026-11-20T11:40', 'Tom Rudd', 'part', 'Ordered DVV-0412 from the supplier, due Wed 25 Nov.']
    ]
  },
  {
    id: '48176', type: 'breakdown', title: 'Boiler dead, no display',
    detail: 'No power to the boiler. Main PCB failed (diagnosed 17 Nov). Supplier back-ordered.',
    eq: ['Glow-worm', 'Energy 30c', 2016], cust: ['Martin Sully', 'household', 2011],
    site: ['9 Brook Road', 'BS6'], date: null, win: null, eng: 'rhys',
    status: 'waiting_parts', parts: [['PCB-0907', 1, 'ordered', '2026-12-02']],
    log: ['2026-11-16T21:02', 'Website', 'Website'],
    notes: [
      ['2026-11-17T10:30', 'Rhys Morgan', 'note', 'PCB failed. Lent the customer two oil-filled radiators.'],
      ['2026-11-17T12:15', 'Tom Rudd', 'part', 'PCB back-ordered at the supplier. Earliest date given: Wed 2 Dec.'],
      ['2026-11-20T16:00', 'Becky Lane', 'call', 'Called Mr Sully with the date. Asked about a second supplier; none has stock.']
    ]
  },

  // ——— Beklemede ———
  {
    id: '48181', type: 'appliance', title: 'Washer drum bearing noise',
    detail: 'Loud rumble on spin. Bearings worn.',
    eq: ['Samsung', 'washing machine', 2017], cust: ['Dev Raman', 'household', 2017],
    site: ['31 Seymour Road', 'BS7'], date: null, win: null, eng: 'marcus',
    status: 'on_hold', hold: 'Customer deciding: repair at £286.80 or replace the machine.',
    parts: [['BRG-0112', 1, 'at_depot']],
    log: ['2026-11-14T12:05', 'Becky Lane', 'Phone'],
    notes: [
      ['2026-11-18T14:20', 'Marcus Bell', 'note', 'Drum bearings worn. Quoted bearing and seal kit plus labour, £286.80 inc VAT.'],
      ['2026-11-21T10:00', 'Becky Lane', 'call', 'Customer still deciding. Will call back by Wednesday.']
    ]
  },
  {
    id: '48170', type: 'landlord', title: 'Landlord gas safety record',
    detail: 'Annual gas safety record: boiler and hob. Current record expires 30 Nov.',
    eq: ['Baxi', '800 Combi 2', 2019, 'gas hob'], cust: ['Harbourside Lettings', 'landlord', 2009],
    site: ['Flat 4, 61 Ashley Down Road', 'BS7'], contact: 'Tenant: Liam Doyle',
    date: null, win: null, status: 'on_hold', hold: 'No access on 16 and 20 Nov. Agent chasing the tenant.',
    flags: ['Current gas safety record expires Mon 30 Nov.'],
    log: ['2026-11-02T10:31', 'Agent portal', 'Agent portal'],
    notes: [
      ['2026-11-16T10:40', 'Sam Pryce', 'note', 'No answer, card left.'],
      ['2026-11-20T09:15', 'Sam Pryce', 'note', 'No answer again. Neighbour says tenant away.'],
      ['2026-11-20T09:40', 'Becky Lane', 'call', 'Told Harbourside. They are chasing the tenant and will give us a date.']
    ]
  },

  // ——— İleri tarih ———
  {
    id: '48160', type: 'install', title: 'New combi, two days',
    detail: 'Replace a Potterton system boiler and cylinder with a combi. Two days. Cylinder cupboard becomes storage.',
    eq: ['Worcester Bosch', 'Greenstar 4000 30kW', undefined, 'replacing a system boiler'], cust: ['Will and Ana Brooks', 'household', 2026],
    site: ['22 Ravenswood Road', 'BS6'], date: '2026-11-24', win: ['08:00', '17:00'], plan: ['08:00', 540], eng: 'joel', status: 'booked',
    log: ['2026-11-02T14:00', 'Ellie Whitcombe', 'Phone']
  }
];

const SOURCE_TEXT: Record<Job['source'], string> = {
  Phone: 'Booked by phone',
  Website: 'Booked on the website',
  'Agent portal': 'Raised on the agent portal',
  'Return visit': 'Return visit booked'
};

export function buildSeed(): Data {
  const customers: Customer[] = [];
  const custId = new Map<string, string>();
  const eng = (id?: string) => ENGINEERS.find((e) => e.id === id);

  const jobs: Job[] = S.map((s, i) => {
    let cid = custId.get(s.cust[0]);
    if (!cid) {
      cid = 'c' + (customers.length + 1);
      custId.set(s.cust[0], cid);
      // 07700 900000–900999: Ofcom'un kurgu için ayırdığı aralık
      const n = 100 + ((customers.length * 37 + 11) % 900);
      customers.push({ id: cid, name: s.cust[0], kind: s.cust[1], phone: `07700 900${String(n).padStart(3, '0')}`, since: s.cust[2] });
    }

    const date = s.date === undefined ? TODAY : s.date;
    const e = eng(s.eng);
    const ev: JobEvent[] = [];
    const [logAt, logBy, source] = s.log;
    ev.push({ at: logAt, by: logBy, kind: 'logged', text: SOURCE_TEXT[source] });

    if (e) {
      const assignedAt = s.assigned ?? bump(logAt, 3 + (i % 7));
      ev.push({ at: assignedAt, by: 'Becky Lane', kind: 'assigned', text: `Assigned to ${e.name}` });
    }
    if (date === TODAY && logAt.slice(0, 10) < TODAY && e && s.win) {
      ev.push({ at: '2026-11-22T17:00', by: 'Automatic', kind: 'text', text: `Reminder text sent: ${s.win[0]}–${s.win[1]} tomorrow` });
    }
    const arrived = s.arrived ? m(s.arrived) : undefined;
    if (s.onWay) ev.push({ at: at(m(s.onWay)), by: e!.name, kind: 'on_way', text: `On the way, ETA ${s.eta}. Text sent to the customer.` });
    else if (arrived !== undefined && e) {
      const ow = arrived - 16 - (i % 9);
      ev.push({ at: at(ow), by: e.name, kind: 'on_way', text: `On the way, ETA ${hm(arrived)}. Text sent to the customer.` });
    }
    if (arrived !== undefined) ev.push({ at: at(arrived), by: e!.name, kind: 'arrived', text: 'Arrived on site' });
    if (s.done) ev.push({ at: at(m(s.done)), by: e!.name, kind: 'done', text: s.doneNote ?? 'Job complete' });
    if (s.hold) ev.push({ at: s.notes?.at(-1)?.[0] ?? logAt, by: 'Becky Lane', kind: 'hold', text: `On hold: ${s.hold}` });
    s.notes?.forEach(([a, by, kind, text]) => ev.push({ at: a, by, kind, text }));
    ev.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

    return {
      id: 'WR-' + s.id,
      type: s.type,
      title: s.title,
      detail: s.detail,
      code: s.code,
      equipment: s.eq ? { make: s.eq[0], model: s.eq[1], fitted: s.eq[2], extra: s.eq[3] } : undefined,
      customer: cid,
      site: { line: s.site[0], area: s.site[1] },
      contact: s.contact,
      access: s.access,
      date,
      window: s.win ? [m(s.win[0]), m(s.win[1])] : null,
      plan: s.plan ? [m(s.plan[0]), s.plan[1]] : undefined,
      engineer: s.eng ?? null,
      status: s.status,
      eta: s.eta ? m(s.eta) : undefined,
      arrived,
      doneAt: s.done ? m(s.done) : undefined,
      holdReason: s.hold,
      flags: s.flags,
      parts: s.parts?.map(([part, qty, state, due]) => ({ part, qty, state, due })),
      source,
      events: ev
    };
  });

  return { engineers: ENGINEERS, customers, parts: PARTS, jobs, invoices: buildInvoices(jobs, customers, custId) };
}

// ——— Faturalar ———
// Bugün biten işlerin faturası aynı kuralla (billing.ts) açılır; geçmiş faturalar elle yazıldı.
// Arşivdeki iş numaraları (WR-47…) verinin içinde yoktur, bağlantısız görünür.
type IEv = [string, string, InvoiceEventKind, string, number?, PayMethod?];
interface ISpec {
  cust: string;
  job?: string;
  site?: string;
  at: string;
  terms: number;
  due?: string;
  lines: [string, number, number][];
  /** Varsayılan: oluşturulduktan 2 dk sonra e-postayla; null = taslak */
  sent?: [string, string, string] | null;
  made?: [string, string];
  ev?: IEv[];
}

const CP12 = 'Landlord gas safety record (CP12), boiler';
const MORE = 'Further gas appliance checked';
const FIRST = 'Call-out and first hour';
const HALF = 'Further labour, per half hour';
const APP = 'Created on the engineer app at the end of the visit';
const BANK = 'Bank feed';

const HIST: ISpec[] = [
  {
    cust: 'Avonside Student Lets', job: 'WR-47320', site: 'Six student houses, BS6 and BS7', at: '2026-09-14T16:30', terms: 30,
    lines: [[CP12, 6, 7000], [MORE, 6, 1500]],
    ev: [
      ['2026-10-17T08:00', 'Automatic', 'reminder', 'Reminder sent: 3 days overdue'],
      ['2026-10-28T08:00', 'Automatic', 'reminder', 'Reminder sent: 14 days overdue'],
      ['2026-11-18T15:10', 'Ellie Whitcombe', 'reminder', 'Final reminder sent to Avonside accounts'],
      ['2026-11-19T14:20', 'Becky Lane', 'note', 'Rang Avonside accounts. They say it goes in their payment run on Fri 27 Nov.']
    ]
  },
  {
    cust: 'Sheila Pask', job: 'WR-47402', site: '7 Ashley Hill, BS6', at: '2026-09-22T10:40', terms: 7,
    lines: [['Annual boiler service', 1, 8250]], made: ['Rhys Morgan', APP], sent: ['2026-09-22T10:43', 'Rhys Morgan', 'Receipt sent by email'],
    ev: [['2026-09-22T10:43', 'Rhys Morgan', 'payment', 'Card payment taken on site', 9900, 'Card on site']]
  },
  {
    cust: 'Harbourside Lettings', job: 'WR-47511', site: 'Flat 2, 14 Zetland Road, BS6', at: '2026-09-29T16:10', terms: 30,
    lines: [[CP12, 1, 7000], [MORE, 1, 1500]],
    ev: [
      ['2026-09-29T16:10', 'Becky Lane', 'note', 'Gas fire found At Risk and capped off. Replacement quoted separately.'],
      ['2026-10-27T09:20', BANK, 'payment', 'Bank transfer received, ref HSL REMIT 1027', 10200, 'Bank transfer']
    ]
  },
  {
    cust: 'Margaret Doyle', job: 'WR-47611', site: '5 Seymour Road, BS7', at: '2026-10-07T11:20', terms: 7,
    lines: [['Annual boiler service', 1, 8250]], made: ['Dan Okafor', APP], sent: ['2026-10-07T11:22', 'Dan Okafor', 'Receipt sent by email'],
    ev: [['2026-10-07T11:22', 'Dan Okafor', 'payment', 'Card payment taken on site', 9900, 'Card on site']]
  },
  {
    cust: 'Harbourside Lettings', job: 'WR-47702', site: '61 Ashley Down Road, BS7 (Flats 1, 2 and 5)', at: '2026-10-12T15:40', terms: 30,
    lines: [['Landlord gas safety record (CP12), Flat 1', 1, 7000], ['Landlord gas safety record (CP12), Flat 5', 1, 7000], [MORE, 2, 1500], ['Wasted visit, no access: Flat 2', 1, 4500]],
    ev: [
      ['2026-11-13T09:05', BANK, 'payment', 'Bank transfer received, ref HSL REMIT 1113', 20400, 'Bank transfer'],
      ['2026-11-13T11:02', 'Becky Lane', 'note', 'Remittance leaves out the wasted visit. Harbourside say the tenant had cancelled; nothing reached us. Sent them the card-left photo.'],
      ['2026-11-14T08:00', 'Automatic', 'reminder', 'Reminder sent: £54.00 overdue']
    ]
  },
  {
    cust: 'Avonside Student Lets', job: 'WR-47731', site: '7 Cotham Grove, BS6', at: '2026-10-19T17:05', terms: 30,
    lines: [[CP12, 2, 7000], [MORE, 2, 1500]],
    ev: [['2026-11-21T08:00', 'Automatic', 'reminder', 'Reminder sent: 3 days overdue']]
  },
  {
    cust: 'Clifton Property Management', job: 'WR-47744', site: 'Flat 3, 2 Royal York Crescent, BS8', at: '2026-10-20T16:00', terms: 30,
    lines: [[CP12, 1, 7000], [MORE, 1, 1500]],
    ev: [['2026-11-16T09:12', BANK, 'payment', 'Bank transfer received, ref CPM 4471', 10200, 'Bank transfer']]
  },
  {
    cust: 'Gloucester Road Dental Practice', job: 'WR-47812', site: '201 Gloucester Road, BS7', at: '2026-10-23T16:00', terms: 30,
    lines: [[FIRST, 1, 9500], ['Filter set, wall-mounted split unit (FLT-0029)', 1, 2780]],
    ev: [['2026-11-23T09:12', BANK, 'payment', 'Bank transfer received, ref GRDP 1123', 14736, 'Bank transfer']]
  },
  {
    cust: 'Rob Hollins', job: 'WR-47866', site: '112 Filton Avenue, BS7', at: '2026-10-28T14:08', terms: 7,
    lines: [[FIRST, 1, 9500], [HALF, 1, 3400], ['Circulating pump, Grundfos UPS2 15-60 (PMP-0153)', 1, 21420]],
    made: ['Sam Pryce', APP], sent: ['2026-10-28T14:50', 'Becky Lane', 'Sent by email with a card payment link'],
    ev: [
      ['2026-10-28T14:12', 'Sam Pryce', 'failed', 'Card declined on site'],
      ['2026-11-07T08:00', 'Automatic', 'reminder', 'Reminder sent: 3 days overdue'],
      ['2026-11-18T08:00', 'Automatic', 'reminder', 'Reminder sent: 14 days overdue'],
      ['2026-11-19T11:30', 'Becky Lane', 'note', 'Rang twice, left a voicemail. Sam is back there on Mon 23 Nov for the leak.']
    ]
  },
  {
    cust: 'Will and Ana Brooks', job: 'WR-48160', site: '22 Ravenswood Road, BS6', at: '2026-11-03T10:15', terms: 0, due: '2026-11-25',
    lines: [
      ['Worcester Bosch Greenstar 4000 30kW combi with horizontal flue', 1, 142000],
      ['Installation labour, two days', 1, 96000],
      ['Remove system boiler and cylinder, make good', 1, 24000],
      ['Power flush and inhibitor', 1, 18000],
      ['Magnetic system filter, 22 mm (MAG-0118)', 1, 13430]
    ],
    made: ['Ellie Whitcombe', 'Created from accepted quote Q-2291. Balance due when the install is finished.'],
    ev: [['2026-11-03T10:41', 'Online payment', 'payment', 'Deposit paid by card from the invoice link', 88000, 'Card']]
  },
  {
    cust: 'Kestrel Print Studio', job: 'WR-47930', site: '96 North Street, BS3', at: '2026-11-04T16:20', terms: 30,
    lines: [[FIRST, 1, 9500], [HALF, 1, 3400], ['Condensate pump, mini, wall-mounted unit', 1, 6200]]
  },
  {
    cust: 'Harbourside Lettings', job: 'WR-47958', site: 'Flat 1, 9 Brunswick Square, BS2', at: '2026-11-02T15:20', terms: 30,
    lines: [[CP12, 1, 7000], [MORE, 2, 1500]]
  },
  {
    cust: 'Clifton Property Management', job: 'WR-47981', site: 'Flat 2, 9 Hotwells Road, BS8', at: '2026-11-09T15:45', terms: 30,
    lines: [[FIRST, 1, 9500], [HALF, 2, 3400], ['Expansion vessel, 8 litre (EXV-0080)', 1, 5480]]
  },
  {
    cust: 'Kofi Boateng', job: 'WR-48093', site: '150 Stapleton Road, BS5', at: '2026-11-16T15:30', terms: 7,
    lines: [[FIRST, 1, 9500]]
  },
  {
    cust: 'Margaret Oyelaran', job: 'WR-48140', site: '22 Elmgrove Road, BS6', at: '2026-11-19T12:10', terms: 7,
    lines: [[FIRST, 1, 9500]], made: ['Kasia Nowak', APP], sent: ['2026-11-19T12:13', 'Kasia Nowak', 'Receipt sent by email'],
    ev: [['2026-11-19T12:13', 'Kasia Nowak', 'payment', 'Card payment taken on site', 11400, 'Card on site']]
  }
];

// Bugün biten işlerde ne oldu: kartla ödendi, kart geçmedi, müşteri ödemeden çıktı; geri kalanı taslak
const TODAY_PAY: Record<string, 'site' | 'declined' | 'left'> = {
  'WR-48188': 'site', 'WR-48190': 'site', 'WR-48186': 'site', 'WR-48191': 'declined', 'WR-48189': 'left'
};

function buildInvoices(jobs: Job[], customers: Customer[], custId: Map<string, string>): Invoice[] {
  const out: Invoice[] = [];

  for (const s of HIST) {
    const cid = custId.get(s.cust)!;
    const issued = s.at.slice(0, 10);
    const by = s.made?.[0] ?? 'Becky Lane';
    const inv: Invoice = {
      id: '', customer: cid, job: s.job, site: s.site, issued, terms: s.terms,
      due: s.due ?? addDays(issued, s.terms),
      lines: s.lines.map(([text, qty, unit]) => ({ text, qty, unit })),
      events: [{ at: s.at, by, kind: 'created', text: s.made?.[1] ?? 'Created' }]
    };
    const sent: [string, string, string] | null = s.sent === undefined ? [bump(s.at, 2), by, 'Sent by email'] : s.sent;
    if (sent) {
      inv.sent = sent[0];
      inv.events.push({ at: sent[0], by: sent[1], kind: 'sent', text: sent[2] });
    }
    s.ev?.forEach(([at, by, kind, text, amount, method]) => inv.events.push({ at, by, kind, text, amount, method }));
    out.push(inv);
  }

  for (const j of jobs) {
    if (j.status !== 'done' || j.date !== TODAY || j.doneAt == null) continue;
    const c = customers.find((x) => x.id === j.customer)!;
    const e = ENGINEERS.find((x) => x.id === j.engineer)!;
    const how = TODAY_PAY[j.id];
    const inv = draftFor(j, c, PARTS, '', at(j.doneAt + 1), how ? e.name : 'Automatic');
    if (!inv) continue;
    if (how) inv.events[0].text = APP;
    if (how === 'site') {
      const when = at(j.doneAt + 3);
      inv.sent = when;
      inv.events.push({ at: when, by: e.name, kind: 'payment', text: 'Card payment taken on site', amount: 0, method: 'Card on site' });
      inv.events.push({ at: when, by: e.name, kind: 'sent', text: 'Receipt sent by email' });
    } else if (how === 'declined') {
      inv.events.push({ at: at(j.doneAt + 4), by: e.name, kind: 'failed', text: 'Card declined on site' });
      inv.sent = at(m('10:05'));
      inv.events.push({ at: inv.sent, by: 'Becky Lane', kind: 'sent', text: 'Sent by email with a card payment link' });
    } else if (how === 'left') {
      inv.events.push({ at: at(j.doneAt + 2), by: e.name, kind: 'note', text: 'Customer left for work before I finished. Please email the invoice.' });
    }
    out.push(inv);
  }

  // Yerinde kartla ödenen tutar fatura toplamıdır; "tamamı ödendi" olayı ödemeler toplamı tutunca düşer
  for (const inv of out) {
    const total = totalOf(inv);
    inv.events.forEach((e) => { if (e.kind === 'payment' && e.amount === 0) e.amount = total; });
    inv.events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    let paid = 0;
    for (const p of inv.events.filter((e) => e.kind === 'payment')) {
      paid += p.amount ?? 0;
      if (paid >= total) {
        inv.events.splice(inv.events.indexOf(p) + 1, 0, { at: p.at, by: 'Automatic', kind: 'paid', text: 'Paid in full' });
        break;
      }
    }
  }

  // Numara kesim sırasına göre verilir; aradaki boşluklar listede olmayan (ödenmiş, eski) faturalardır
  out.sort((a, b) => (a.events[0].at < b.events[0].at ? -1 : 1));
  const perDay = new Map<string, number>();
  for (const inv of out) {
    const k = perDay.get(inv.issued) ?? 0;
    perDay.set(inv.issued, k + 1);
    inv.id = 'INV-' + (30012 + daysBetween('2026-09-01', inv.issued) * 29 + k * 3);
  }
  return out;
}

function bump(iso: string, minutes: number) {
  const d = new Date(iso + ':00');
  d.setMinutes(d.getMinutes() + minutes);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

