import { CalendarDays, Filter, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Logo } from '@/components/logo';
import { PageHeader } from '@/components/page-header';
import { PersonCell } from '@/components/person-cell';
import { StatCard } from '@/components/stat-card';
import { StatusPill } from '@/components/status-pill';
import { StepIcon, type StepState } from '@/components/step-icon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

/**
 * Temporary: the design system on one page, laid out like WeGro's own
 * dashboard, to review colours, type and components before real screens.
 * The app shell (TODO item 5) replaces it. Figures are made up.
 */

const STATS = [
  { value: '129', label: 'Total Projects', tone: 'total' },
  { value: '17084', label: 'Total Applications', tone: 'total' },
  { value: '13711', label: 'Approved Applications', tone: 'positive' },
  { value: '2643', label: 'Rejected Applications', tone: 'negative' },
  { value: '75', label: 'Total Field Officers', tone: 'total' },
  { value: '657.7M BDT', label: 'Total Collectable', tone: 'total' },
  { value: '412.1M BDT', label: 'Total Collection', tone: 'positive' },
  { value: '195.3M BDT', label: 'Total Overdue', tone: 'negative' },
] as const;

const ROWS: Array<{
  id: string;
  name: string;
  phone: string;
  project: string;
  steps: [StepState, StepState, StepState];
  loan: string;
  status: { tone: 'success' | 'neutral' | 'warning' | 'danger'; label: string };
}> = [
  {
    id: 'F-42296',
    name: 'Taposh Chandra Roy',
    phone: '+8801839458416',
    project: 'B-2026-Q4-Maize',
    steps: ['waiting', 'waiting', 'waiting'],
    loan: '0 BDT',
    status: { tone: 'warning', label: 'Pending' },
  },
  {
    id: 'F-40784',
    name: 'Komal Chandra Roy',
    phone: '+8801737200519',
    project: 'B-2026-Q4-Maize',
    steps: ['done', 'done', 'waiting'],
    loan: '0 BDT',
    status: { tone: 'neutral', label: 'Not Started' },
  },
  {
    id: 'F-40780',
    name: 'Hori Barmon',
    phone: '+8801724080286',
    project: 'B-2026-Q4-Maize',
    steps: ['done', 'done', 'done'],
    loan: '45,000 BDT',
    status: { tone: 'success', label: 'Verified' },
  },
  {
    id: 'F-40789',
    name: 'Besomote Rani',
    phone: '+8801765344602',
    project: 'B-2026-Q4-Maize',
    steps: ['done', 'refused', 'waiting'],
    loan: '0 BDT',
    status: { tone: 'danger', label: 'Rejected' },
  },
];

const STEP_NAMES = ['Field officer', 'Admin', 'Accounts'];

const SWATCHES = [
  ['Brand green', 'bg-brand', '#045747'],
  ['Action (leaf)', 'bg-primary', '#51840A'],
  ['Leaf (decor)', 'bg-wegro-leaf', '#64A30C'],
  ['Totals (amber)', 'bg-warning-strong', '#E47809'],
  ['Logo orange', 'bg-wegro-orange', '#F15D2D'],
  ['Danger', 'bg-danger', '#E22D22'],
  ['Neutral', 'bg-neutral', '#6B7280'],
  ['Text', 'bg-foreground', '#0E192B'],
] as const;

export function DesignPreview() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 p-4 sm:p-6">
      <Logo className="h-10 self-start" />

      <PageHeader
        title="All Farmers Onboarding"
        description="Design preview: WeGro's dashboard style with the platform's components."
        actions={
          <Button>
            <Plus /> Add Project
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {STATS.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </section>

      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-2">
          {['Application Date', 'Disbursement Date'].map((label) => (
            <div
              key={label}
              className="grid gap-1 sm:flex sm:items-center sm:gap-3"
            >
              <Label className="text-muted-foreground sm:w-36">{label}:</Label>
              <div className="relative">
                <Input
                  placeholder="dd MMM yyyy ~ dd MMM yyyy"
                  className="w-full pr-9 sm:w-64"
                />
                <CalendarDays className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 lg:flex-none">
            <Input placeholder="Search" className="w-full pr-9 lg:w-48" />
            <Search className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          <Button variant="outline">
            <Filter /> Filters
          </Button>
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Farmer</TableHead>
              <TableHead>Project</TableHead>
              {STEP_NAMES.map((n) => (
                <TableHead key={n} className="text-center">
                  {n}
                </TableHead>
              ))}
              <TableHead className="text-right">Approved Loan</TableHead>
              <TableHead>Farmer Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROWS.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground">{r.id}</TableCell>
                <TableCell>
                  <PersonCell name={r.name} detail={r.phone} />
                </TableCell>
                <TableCell>{r.project}</TableCell>
                {r.steps.map((state, i) => (
                  <TableCell key={i} className="text-center">
                    <StepIcon
                      state={state}
                      label={`${STEP_NAMES[i]}: ${state}`}
                    />
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">
                  {r.loan}
                </TableCell>
                <TableCell>
                  <StatusPill tone={r.status.tone}>{r.status.label}</StatusPill>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="grid gap-4 rounded-lg border p-5">
          <h2 className="text-lg font-bold">Buttons</h2>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => toast.success('Payment confirmed')}>
              Main action
            </Button>
            <Button variant="brand">Brand</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Reject</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg">Large</Button>
            <Button>Default 44 px</Button>
            <Button size="sm">Small (desktop)</Button>
            <Button disabled>Disabled</Button>
          </div>
          <h2 className="text-lg font-bold">Status</h2>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="success">Verified</StatusPill>
            <StatusPill tone="warning">Pending</StatusPill>
            <StatusPill tone="danger">Rejected</StatusPill>
            <StatusPill tone="neutral">Not Started</StatusPill>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="success" appearance="soft">
              Verified
            </StatusPill>
            <StatusPill tone="warning" appearance="soft">
              Pending
            </StatusPill>
            <StatusPill tone="danger" appearance="soft">
              Rejected
            </StatusPill>
            <StatusPill tone="neutral" appearance="soft">
              Not Started
            </StatusPill>
          </div>
        </div>

        <div className="grid gap-4 rounded-lg border p-5">
          <h2 className="text-lg font-bold">Forms</h2>
          <div className="grid gap-2">
            <Label htmlFor="pv-name">Farmer name</Label>
            <Input id="pv-name" placeholder="Rahim Uddin" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pv-notes">Notes</Label>
            <Textarea
              id="pv-notes"
              placeholder="What did you see on the field?"
            />
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Label className="gap-2">
              <Checkbox defaultChecked /> Insured
            </Label>
            <Label className="gap-2">
              <Switch /> Send reminders
            </Label>
          </div>
          <div lang="bn" className="rounded-md bg-muted p-3">
            <div className="font-bold">প্রকল্পের অবস্থা: অনুমোদিত</div>
            <div className="text-muted-foreground">
              মোট বিনিয়োগ ৳ ১,২৫,০০০ — ফসল: ভুট্টা (Maize), বগুড়া
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-bold">Palette</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {SWATCHES.map(([name, bg, hex]) => (
            <div key={name} className="overflow-hidden rounded-lg border">
              <div className={`h-14 ${bg}`} />
              <div className="p-2 text-xs">
                <div className="font-semibold">{name}</div>
                <div className="text-muted-foreground">{hex}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="flex items-center gap-3 rounded-lg bg-brand p-4 text-brand-foreground">
        <Logo onDark className="h-6" />
        <span className="text-sm">The wordmark on brand green.</span>
      </footer>
    </div>
  );
}
