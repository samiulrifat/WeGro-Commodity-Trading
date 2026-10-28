import { Link, useNavigate } from '@tanstack/react-router';
import {
  CircleCheck,
  CircleX,
  Pencil,
  ShieldQuestion,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ApiError, toApiError } from '@/api/errors';
import {
  type ProjectDto,
  useLazyProjectsIntegrityQuery,
  useProjectsActivateMutation,
  useProjectsCancelMutation,
  useProjectsCloseMutation,
  useProjectsHoldersQuery,
  useProjectsPublishMutation,
  useProjectsReadyForSaleMutation,
  useProjectsRemoveMutation,
  useProjectsTimelineQuery,
} from '@/api/generated/projects';
import { FormError } from '@/app/auth/form-error';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useFormat } from '@/i18n/use-format';
import { useAppSelector } from '@/store/hooks';
import { canRunProjects } from './permissions';
import { useAuditWords } from '@/features/audit/words';

type Move =
  'publish' | 'activate' | 'readyForSale' | 'close' | 'cancel' | 'remove';

/** The admin's moves at each stage; the ledger checks them again. */
const MOVES: Record<ProjectDto['stage'], readonly Move[]> = {
  draft: ['publish', 'remove'],
  open_for_funding: ['cancel'],
  funded: ['activate', 'cancel'],
  active: ['readyForSale'],
  ready_for_sale: [],
  paid_out: ['close'],
  closed: [],
  cancelled: [],
};

const LEDGER_CHECKERS = new Set(['super_admin', 'admin', 'auditor']);
const HOLDER_READERS = new Set(['super_admin', 'admin', 'accounts', 'auditor']);

/** Staff only: stage moves, the ledger check, and who holds slots. */
export function StaffPanel({ project: p }: { project: ProjectDto }) {
  const role = useAppSelector((s) => s.session.user!.role);
  return (
    <>
      {canRunProjects(role) && <Moves project={p} />}
      {LEDGER_CHECKERS.has(role) && p.chainState !== 'local' && (
        <LedgerCheck project={p} />
      )}
      {HOLDER_READERS.has(role) && p.chainState !== 'local' && (
        <Holders project={p} />
      )}
    </>
  );
}

function Moves({ project: p }: { project: ProjectDto }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Move | null>(null);
  const moves = p.chainState === 'local' ? MOVES.draft : MOVES[p.stage];
  if (moves.length === 0 && p.chainState !== 'local') return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('projects.manage')}</CardTitle>
        <CardDescription>{t(`projects.manageText.${p.stage}`)}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {p.chainState === 'local' && (
          <Link
            to="/projects/$projectId/edit"
            params={{ projectId: p.id }}
            className={buttonVariants({ variant: 'outline' })}
          >
            <Pencil /> {t('projects.edit')}
          </Link>
        )}
        {moves.map((m) => (
          <Button
            key={m}
            variant={
              m === 'cancel' || m === 'remove' ? 'destructive' : 'default'
            }
            onClick={() => setOpen(m)}
          >
            {m === 'remove' && <Trash2 />}
            {t(`projects.move.${m}`)}
          </Button>
        ))}
      </CardContent>
      {open && (
        <MoveDialog project={p} move={open} onClose={() => setOpen(null)} />
      )}
    </Card>
  );
}

function MoveDialog({
  project: p,
  move,
  onClose,
}: {
  project: ProjectDto;
  move: Move;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [publish] = useProjectsPublishMutation();
  const [activate] = useProjectsActivateMutation();
  const [ready] = useProjectsReadyForSaleMutation();
  const [close] = useProjectsCloseMutation();
  const [cancel] = useProjectsCancelMutation();
  const [remove] = useProjectsRemoveMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function go() {
    setError(null);
    setBusy(true);
    const arg = { id: p.id };
    try {
      if (move === 'publish') await publish(arg).unwrap();
      if (move === 'activate') await activate(arg).unwrap();
      if (move === 'readyForSale') await ready(arg).unwrap();
      if (move === 'close') await close(arg).unwrap();
      if (move === 'cancel') await cancel(arg).unwrap();
      if (move === 'remove') {
        await remove(arg).unwrap();
        void navigate({ to: '/projects/drafts' });
      }
      toast.success(t(`projects.moved.${move}`, { title: p.title }));
      onClose();
    } catch (e) {
      setError(toApiError(e as never));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(`projects.moveTitle.${move}`, { title: p.title })}
          </DialogTitle>
          <DialogDescription>
            {t(`projects.moveText.${move}`)}
          </DialogDescription>
        </DialogHeader>
        <FormError error={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('catalog.cancel')}
          </Button>
          <Button
            variant={
              move === 'cancel' || move === 'remove' ? 'destructive' : 'default'
            }
            disabled={busy}
            onClick={() => void go()}
          >
            {busy ? t('people.actions.working') : t(`projects.move.${move}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LedgerCheck({ project: p }: { project: ProjectDto }) {
  const { t } = useTranslation();
  const words = useAuditWords();
  const [check, result] = useLazyProjectsIntegrityQuery();
  const data = result.data?.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('people.ledger')}</CardTitle>
        <CardDescription>{t('projects.ledgerText')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Button
          variant="outline"
          disabled={result.isFetching}
          onClick={() => void check({ id: p.id })}
        >
          <ShieldQuestion />
          {result.isFetching
            ? t('people.integrity.checking')
            : t('people.integrity.check')}
        </Button>
        {result.error && <FormError error={toApiError(result.error)} />}
        {data &&
          (data.matches ? (
            <Alert>
              <CircleCheck />
              <AlertTitle>{t('projects.ledgerMatches')}</AlertTitle>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <CircleX />
              <AlertTitle>{t('projects.ledgerDiffers')}</AlertTitle>
              <AlertDescription>
                {data.mismatches.map((m) => words.mismatch(m)).join(' · ')}
              </AlertDescription>
            </Alert>
          ))}
      </CardContent>
    </Card>
  );
}

function Holders({ project: p }: { project: ProjectDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const query = useProjectsHoldersQuery({ id: p.id });
  const rows = query.data?.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('projects.holders')}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground">{t('projects.noHolders')}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((h) => (
              <li
                key={h.investor.id}
                className="flex justify-between gap-3 py-2"
              >
                <Link
                  to="/people/$personId"
                  params={{ personId: h.investor.id }}
                  className="inline-flex min-h-11 items-center font-medium hover:underline"
                >
                  {h.investor.fullName}
                </Link>
                <span className="text-muted-foreground">
                  {t('projects.unitsWord', { count: h.slots })} ·{' '}
                  {fmt.taka(h.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** What happened to the project, from the ledger, oldest first. */
export function Timeline({ project: p }: { project: ProjectDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const query = useProjectsTimelineQuery(
    { id: p.id },
    { skip: p.chainState === 'local' },
  );
  if (p.chainState === 'local') return null;
  const entries = query.data?.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('projects.timeline')}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-muted-foreground">{t('projects.noTimeline')}</p>
        ) : (
          <ol className="relative grid gap-4 border-l pl-5">
            {entries.map((e, i) => (
              <li key={`${e.txHash}-${i}`} className="relative">
                <span
                  aria-hidden
                  className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full bg-brand"
                />
                <p className="font-medium">
                  {e.kind === 'stage_changed' && e.stage
                    ? t('projects.timelineStage', {
                        stage: t(`projects.stage.${e.stage}`),
                      })
                    : t(`projects.timelineKind.${e.kind}`)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {fmt.dateTime(e.at)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
