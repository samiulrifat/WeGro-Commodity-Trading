/** The backend's limits (PASSWORD_MIN_LENGTH / PASSWORD_MAX_LENGTH). */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export interface NewPassword {
  value: string;
  again: string;
}

/** What is wrong with a new password, or null. */
export function newPasswordProblem(
  p: NewPassword,
): 'tooShort' | 'tooLong' | 'mismatch' | null {
  if (p.value.length < PASSWORD_MIN) return 'tooShort';
  if (p.value.length > PASSWORD_MAX) return 'tooLong';
  if (p.value !== p.again) return 'mismatch';
  return null;
}
