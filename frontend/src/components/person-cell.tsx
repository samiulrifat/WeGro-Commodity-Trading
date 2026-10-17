import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface PersonCellProps {
  name: string;
  /** Shown under the name, e.g. the phone number. */
  detail?: string;
  photoUrl?: string;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

/** A person in a table row: photo or initials, name, and a detail line. */
export function PersonCell({ name, detail, photoUrl }: PersonCellProps) {
  return (
    <div className="flex items-center gap-3">
      <Avatar>
        {photoUrl && <AvatarImage src={photoUrl} alt="" />}
        <AvatarFallback className="bg-secondary text-xs font-bold text-secondary-foreground">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate font-semibold">{name}</div>
        {detail && (
          <div className="truncate text-sm text-muted-foreground">{detail}</div>
        )}
      </div>
    </div>
  );
}
