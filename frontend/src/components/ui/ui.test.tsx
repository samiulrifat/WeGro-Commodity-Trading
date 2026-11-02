// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from './alert-dialog';
import { Alert, AlertAction, AlertDescription, AlertTitle } from './alert';
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from './avatar';
import { Badge } from './badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from './dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './dropdown-menu';
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from './field';
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from './progress';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetClose,
  SheetTitle,
  SheetTrigger,
} from './sheet';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableRow,
} from './table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';

afterEach(cleanup);

/**
 * The parts of the shared components no page uses yet, drawn once each:
 * they are kept for the screens to come, and must keep working.
 */
describe('the shared components', () => {
  it('draw alerts, badges, cards and tables in every part', () => {
    render(
      <>
        <Alert>
          <AlertTitle>Title</AlertTitle>
          <AlertDescription>Text</AlertDescription>
          <AlertAction>Act</AlertAction>
        </Alert>
        <Badge render={<a href="/x" aria-label="Linked badge" />}>
          Linked badge
        </Badge>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Card</CardTitle>
          </CardHeader>
          <CardContent>Body</CardContent>
          <CardFooter>Footer</CardFooter>
        </Card>
        <Table>
          <TableCaption>Caption</TableCaption>
          <TableBody>
            <TableRow>
              <TableCell>Cell</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </>,
    );
    for (const text of ['Act', 'Footer', 'Caption', 'Total'])
      expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Linked badge' })).toBeTruthy();
  });

  it('draw avatars with a picture, a badge, and a group count', () => {
    render(
      <AvatarGroup>
        <Avatar size="lg">
          <AvatarImage src="/a.png" alt="A" />
          <AvatarFallback>RB</AvatarFallback>
          <AvatarBadge>1</AvatarBadge>
        </Avatar>
        <AvatarGroupCount>+3</AvatarGroupCount>
      </AvatarGroup>,
    );
    expect(screen.getByText('+3')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('draw fields in sets and groups, with one error or several', () => {
    render(
      <FieldSet>
        <FieldLegend variant="label">Legend</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldContent>
              <FieldTitle>Title</FieldTitle>
            </FieldContent>
            <FieldError errors={[{ message: 'One' }]} />
          </Field>
          <FieldSeparator>or</FieldSeparator>
          <FieldSeparator />
          <Field>
            <FieldError
              errors={[
                { message: 'Two' },
                { message: 'Two' },
                { message: 'Three' },
                undefined,
              ]}
            />
            <FieldError errors={[]} />
          </Field>
        </FieldGroup>
      </FieldSet>,
    );
    expect(screen.getByText('One')).toBeTruthy();
    // Repeated messages are shown once.
    expect(screen.getAllByText('Two')).toHaveLength(1);
    expect(screen.getByText('Three')).toBeTruthy();
    expect(screen.getByText('or')).toBeTruthy();
  });

  it('draw a progress bar with its label and value', () => {
    render(
      <Progress value={40}>
        <ProgressLabel>Used</ProgressLabel>
        <ProgressValue />
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      </Progress>,
    );
    expect(screen.getByText('Used')).toBeTruthy();
  });

  it('draw dialogs, alert dialogs and sheets with every part', () => {
    render(
      <>
        <Dialog open>
          <DialogTrigger>Open dialog</DialogTrigger>
          <DialogContent showCloseButton={false}>
            <DialogTitle>Dialog</DialogTitle>
            <DialogFooter showCloseButton>
              <DialogClose>Close it</DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog open>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogMedia>!</AlertDialogMedia>
              <AlertDialogTitle>Sure?</AlertDialogTitle>
              <AlertDialogDescription>Really.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>No</AlertDialogCancel>
              <AlertDialogAction>Yes</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Sheet open>
          <SheetTrigger>Open sheet</SheetTrigger>
          <SheetContent side="right" showCloseButton={false}>
            <SheetClose>Close sheet</SheetClose>
            <SheetHeader>
              <SheetTitle>Sheet</SheetTitle>
              <SheetDescription>About</SheetDescription>
            </SheetHeader>
            <SheetFooter>Sheet footer</SheetFooter>
          </SheetContent>
        </Sheet>
      </>,
    );
    for (const text of [
      'Close it',
      'Close sheet',
      'Yes',
      'No',
      'Sheet footer',
      '!',
    ])
      expect(screen.getByText(text)).toBeTruthy();
  });

  it('draw menus with groups, checks, choices and submenus', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel inset>Label</DropdownMenuLabel>
            <DropdownMenuItem inset variant="destructive">
              Delete <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked>Checked</DropdownMenuCheckboxItem>
          <DropdownMenuPortal />
          <DropdownMenuRadioGroup value="a">
            <DropdownMenuRadioItem value="a">Choice A</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSub open>
            <DropdownMenuSubTrigger inset>More</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Inner</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    for (const text of ['⌘D', 'Checked', 'Choice A', 'More'])
      expect(screen.getByText(text)).toBeTruthy();
  });

  it('draw a list to choose from with groups and labels', () => {
    render(
      <Select open value="a" items={[{ value: 'a', label: 'Apple' }]}>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Fruit</SelectLabel>
            <SelectItem value="a">Apple</SelectItem>
          </SelectGroup>
          <SelectSeparator />
        </SelectContent>
      </Select>,
    );
    expect(screen.getByText('Fruit')).toBeTruthy();
  });

  it('draw a tooltip', () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Hover</TooltipTrigger>
          <TooltipContent>Tip</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByText('Tip')).toBeTruthy();
  });
});
